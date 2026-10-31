import { sendSystemEmail } from "@/lib/auth/email";
import { getDB } from "@/lib/env";
import { lifecycleTarget, type SimState } from "@/lib/portal/catalogue";
import { newId } from "@/lib/portal/ids";
import { loadPlatformPlanRecord, tenantHasPlatformPlan } from "@/lib/portal/platform-plans";
import { changeSimRatePlan } from "@/lib/portal/rate-plan-change";
import { recipientsFromAlertSetup } from "@/lib/portal/rate-plan-notify";
import { applyLifecycle, writeAudit } from "@/lib/portal/repo";
import {
  BULK_SIM_CAP,
  type BulkJobKind,
  type BulkJobStatus,
} from "@/lib/portal/sim-bulk-shared";
import { loadTenant } from "@/lib/portal/tenant";

export { BULK_SIM_CAP, type BulkJobKind, type BulkJobStatus } from "@/lib/portal/sim-bulk-shared";

/** Jasper PUT+GET per SIM — keep each Worker hop short. */
const LIFECYCLE_CHUNK = 8;
const RATE_PLAN_CHUNK = 40;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function createSimBulkJob(
  tenantId: string,
  actorEmail: string,
  input: { kind: BulkJobKind; iccids: string[]; platformPlanId?: string },
): Promise<BulkJobStatus> {
  const kind = input.kind;
  if (kind !== "Activate" && kind !== "Deactivate" && kind !== "rate_plan") {
    throw new Error("Choose Activate, Deactivate, or Reseller Plan.");
  }

  const cleaned = [
    ...new Set(input.iccids.map((value) => value.replace(/\s/g, "")).filter(Boolean)),
  ];
  if (cleaned.length === 0) throw new Error("Select at least one SIM.");
  if (cleaned.length > BULK_SIM_CAP) {
    throw new Error(`Max ${BULK_SIM_CAP} SIMs per update.`);
  }

  let platformPlanId: string | null = null;
  if (kind === "rate_plan") {
    platformPlanId = input.platformPlanId?.trim() || null;
    if (!platformPlanId) throw new Error("Choose a Reseller Plan.");
    if (!(await tenantHasPlatformPlan(tenantId, platformPlanId))) {
      throw new Error("That rate plan is not on this reseller’s contract.");
    }
    const plan = await loadPlatformPlanRecord(platformPlanId);
    if (!plan?.active) throw new Error("That rate plan is deactivated.");
  }

  const db = getDB();
  const placeholders = cleaned.map(() => "?").join(",");
  const owned = await db
    .prepare(
      `SELECT iccid, state FROM sims WHERE tenant_id = ? AND iccid IN (${placeholders})`,
    )
    .bind(tenantId, ...cleaned)
    .all<{ iccid: string; state: SimState }>();
  const byIccid = new Map((owned.results ?? []).map((row) => [row.iccid, row.state]));
  for (const iccid of cleaned) {
    if (!byIccid.has(iccid)) throw new Error(`SIM ${iccid} is not in this organisation.`);
  }

  if (kind === "Activate" || kind === "Deactivate") {
    for (const iccid of cleaned) {
      const state = byIccid.get(iccid)!;
      if (!lifecycleTarget(kind, state)) {
        throw new Error(`${kind} is not valid from ${state} (${iccid}).`);
      }
    }
  }

  const id = newId("sbj");
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO sim_bulk_jobs
        (id, tenant_id, kind, platform_plan_id, status, total, done, ok_count, failed_count,
         actor_email, created_at, updated_at, notified_at)
       VALUES (?, ?, ?, ?, 'queued', ?, 0, 0, 0, ?, ?, ?, NULL)`,
    )
    .bind(id, tenantId, kind, platformPlanId, cleaned.length, actorEmail, now, now)
    .run();

  const stmts = cleaned.map((iccid) => {
    const itemId = newId("sbi");
    return db
      .prepare(
        `INSERT INTO sim_bulk_job_items (id, job_id, iccid, status, error, updated_at)
         VALUES (?, ?, ?, 'pending', NULL, ?)`,
      )
      .bind(itemId, id, iccid, now);
  });
  await db.batch(stmts);

  const label =
    kind === "rate_plan" ? `Reseller Plan bulk (${cleaned.length})` : `${kind} bulk (${cleaned.length})`;
  await writeAudit(
    tenantId,
    actorEmail,
    kind === "rate_plan" ? "rate_plan" : "lifecycle",
    `Bulk job ${id}: ${label}`,
  );

  return getSimBulkJob(tenantId, id) as Promise<BulkJobStatus>;
}

export async function getSimBulkJob(tenantId: string, jobId: string): Promise<BulkJobStatus | null> {
  const row = await getDB()
    .prepare(
      `SELECT id, kind, platform_plan_id, status, total, done, ok_count, failed_count,
              actor_email, created_at, updated_at
       FROM sim_bulk_jobs WHERE id = ? AND tenant_id = ?`,
    )
    .bind(jobId, tenantId)
    .first<{
      id: string;
      kind: BulkJobKind;
      platform_plan_id: string | null;
      status: BulkJobStatus["status"];
      total: number;
      done: number;
      ok_count: number;
      failed_count: number;
      actor_email: string;
      created_at: string;
      updated_at: string;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    platformPlanId: row.platform_plan_id,
    status: row.status,
    total: row.total,
    done: row.done,
    okCount: row.ok_count,
    failedCount: row.failed_count,
    actorEmail: row.actor_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Process the next chunk of a bulk job. Client polls this until status is completed/failed.
 */
export async function processSimBulkJobChunk(
  tenantId: string,
  actorEmail: string,
  jobId: string,
): Promise<BulkJobStatus> {
  const db = getDB();
  const job = await getSimBulkJob(tenantId, jobId);
  if (!job) throw new Error("Bulk job not found.");
  if (job.status === "completed" || job.status === "failed") return job;

  const chunkSize = job.kind === "rate_plan" ? RATE_PLAN_CHUNK : LIFECYCLE_CHUNK;
  const pending = await db
    .prepare(
      `SELECT id, iccid FROM sim_bulk_job_items
       WHERE job_id = ? AND status = 'pending'
       ORDER BY iccid ASC LIMIT ?`,
    )
    .bind(jobId, chunkSize)
    .all<{ id: string; iccid: string }>();
  const items = pending.results ?? [];

  const now = new Date().toISOString();
  if (items.length === 0) {
    await db
      .prepare(
        `UPDATE sim_bulk_jobs SET status = 'completed', updated_at = ? WHERE id = ? AND tenant_id = ?`,
      )
      .bind(now, jobId, tenantId)
      .run();
    await notifyBulkJobComplete(tenantId, jobId);
    return (await getSimBulkJob(tenantId, jobId))!;
  }

  await db
    .prepare(
      `UPDATE sim_bulk_jobs SET status = 'running', updated_at = ? WHERE id = ? AND tenant_id = ?`,
    )
    .bind(now, jobId, tenantId)
    .run();

  let okDelta = 0;
  let failDelta = 0;

  for (const item of items) {
    const stamp = new Date().toISOString();
    try {
      if (job.kind === "rate_plan") {
        await changeSimRatePlan(tenantId, actorEmail, {
          iccid: item.iccid,
          platformPlanId: job.platformPlanId!,
          skipNotify: true,
        });
      } else {
        await applyLifecycle(tenantId, actorEmail, {
          iccid: item.iccid,
          action: job.kind,
          skipNotify: true,
        });
      }
      await db
        .prepare(
          `UPDATE sim_bulk_job_items SET status = 'ok', error = NULL, updated_at = ? WHERE id = ?`,
        )
        .bind(stamp, item.id)
        .run();
      okDelta += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed.";
      await db
        .prepare(
          `UPDATE sim_bulk_job_items SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(message.slice(0, 500), stamp, item.id)
        .run();
      failDelta += 1;
    }
  }

  const doneDelta = okDelta + failDelta;
  await db
    .prepare(
      `UPDATE sim_bulk_jobs
       SET done = done + ?, ok_count = ok_count + ?, failed_count = failed_count + ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(doneDelta, okDelta, failDelta, new Date().toISOString(), jobId, tenantId)
    .run();

  const latest = (await getSimBulkJob(tenantId, jobId))!;
  if (latest.done >= latest.total) {
    await db
      .prepare(
        `UPDATE sim_bulk_jobs SET status = 'completed', updated_at = ? WHERE id = ? AND tenant_id = ?`,
      )
      .bind(new Date().toISOString(), jobId, tenantId)
      .run();
    await notifyBulkJobComplete(tenantId, jobId);
    return (await getSimBulkJob(tenantId, jobId))!;
  }

  return latest;
}

async function notifyBulkJobComplete(tenantId: string, jobId: string): Promise<void> {
  const db = getDB();
  const row = await db
    .prepare(`SELECT notified_at FROM sim_bulk_jobs WHERE id = ? AND tenant_id = ?`)
    .bind(jobId, tenantId)
    .first<{ notified_at: string | null }>();
  if (row?.notified_at) return;

  const job = await getSimBulkJob(tenantId, jobId);
  if (!job) return;

  const recipients = await recipientsFromAlertSetup(tenantId);
  if (recipients.length === 0) {
    await db
      .prepare(`UPDATE sim_bulk_jobs SET notified_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), jobId)
      .run();
    return;
  }

  const tenant = await loadTenant(tenantId);
  const orgName = tenant?.name?.trim() || "Organisation";
  let actionLabel: string = job.kind;
  if (job.kind === "rate_plan" && job.platformPlanId) {
    const plan = await loadPlatformPlanRecord(job.platformPlanId);
    actionLabel = `Reseller Plan → ${plan?.name ?? job.platformPlanId}`;
  }

  const failures = await db
    .prepare(
      `SELECT iccid, error FROM sim_bulk_job_items
       WHERE job_id = ? AND status = 'failed' ORDER BY iccid ASC LIMIT 20`,
    )
    .bind(jobId)
    .all<{ iccid: string; error: string | null }>();

  const failRows = (failures.results ?? [])
    .map(
      (item) =>
        `<tr><td style="padding:4px 8px;font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(item.iccid)}</td><td style="padding:4px 8px;color:#b91c1c;font-size:12px;">${escapeHtml(item.error ?? "failed")}</td></tr>`,
    )
    .join("");

  const subject = `Catalyst bulk update: ${orgName} · ${job.okCount} ok / ${job.failedCount} failed`;
  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;">
    <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#0d9488;font-weight:700;">ATN Catalyst</p>
    <h2 style="margin:8px 0 16px;color:#111827;">Bulk SIM update finished</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
      <tr><td style="padding:6px 0;color:#6b7280;">Organisation</td><td style="padding:6px 0;">${escapeHtml(orgName)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Action</td><td style="padding:6px 0;">${escapeHtml(actionLabel)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Result</td><td style="padding:6px 0;">${job.okCount} ok · ${job.failedCount} failed · ${job.total} total</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">By</td><td style="padding:6px 0;">${escapeHtml(job.actorEmail)}</td></tr>
    </table>
    ${
      failRows
        ? `<p style="margin:16px 0 8px;font-size:13px;color:#6b7280;">Sample failures</p>
           <table style="width:100%;border-collapse:collapse;">${failRows}</table>`
        : ""
    }
    <p style="margin:20px 0 0;color:#6b7280;font-size:13px;">Open SIMs / Logs in Catalyst for the full record.</p>
  </div>`;

  for (const to of recipients) {
    try {
      await sendSystemEmail(to, subject, html);
    } catch (err) {
      console.error("[bulk-notify]", to, err instanceof Error ? err.message : err);
    }
  }

  await db
    .prepare(`UPDATE sim_bulk_jobs SET notified_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), jobId)
    .run();
}
