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
  type BulkItemAction,
  type BulkJobItemInput,
  type BulkJobKind,
  type BulkJobStatus,
} from "@/lib/portal/sim-bulk-shared";
import { loadTenant } from "@/lib/portal/tenant";

export {
  BULK_SIM_CAP,
  type BulkItemAction,
  type BulkJobItemInput,
  type BulkJobKind,
  type BulkJobStatus,
} from "@/lib/portal/sim-bulk-shared";

/** Mixed jobs may include Jasper lifecycle — keep chunks small. */
const PROCESS_CHUNK = 8;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isItemAction(value: string): value is BulkItemAction {
  return value === "Activate" || value === "Deactivate" || value === "rate_plan";
}

export async function createSimBulkJob(
  tenantId: string,
  actorEmail: string,
  input: { items: BulkJobItemInput[] },
): Promise<BulkJobStatus> {
  const byIccid = new Map<string, BulkJobItemInput>();
  for (const raw of input.items) {
    const iccid = raw.iccid.replace(/\s/g, "");
    if (!iccid) continue;
    if (!isItemAction(raw.action)) throw new Error(`Invalid action for ${iccid}.`);
    byIccid.set(iccid, {
      iccid,
      action: raw.action,
      platformPlanId: raw.platformPlanId?.trim() || undefined,
    });
  }
  const items = [...byIccid.values()];
  if (items.length === 0) throw new Error("Select at least one SIM with an action.");
  if (items.length > BULK_SIM_CAP) throw new Error(`Max ${BULK_SIM_CAP} SIMs per update.`);

  const db = getDB();
  const placeholders = items.map(() => "?").join(",");
  const owned = await db
    .prepare(
      `SELECT iccid, state FROM sims WHERE tenant_id = ? AND iccid IN (${placeholders})`,
    )
    .bind(tenantId, ...items.map((item) => item.iccid))
    .all<{ iccid: string; state: SimState }>();
  const stateByIccid = new Map((owned.results ?? []).map((row) => [row.iccid, row.state]));

  const planCache = new Map<string, boolean>();
  for (const item of items) {
    if (!stateByIccid.has(item.iccid)) {
      throw new Error(`SIM ${item.iccid} is not in this organisation.`);
    }
    const state = stateByIccid.get(item.iccid)!;
    if (item.action === "Activate" || item.action === "Deactivate") {
      if (!lifecycleTarget(item.action, state)) {
        throw new Error(`${item.action} is not valid from ${state} (${item.iccid}).`);
      }
    } else {
      const planId = item.platformPlanId;
      if (!planId) throw new Error(`Choose a Reseller Plan for ${item.iccid}.`);
      let allowed = planCache.get(planId);
      if (allowed == null) {
        allowed = await tenantHasPlatformPlan(tenantId, planId);
        planCache.set(planId, allowed);
        if (allowed) {
          const plan = await loadPlatformPlanRecord(planId);
          if (!plan?.active) throw new Error(`Reseller Plan is deactivated (${planId}).`);
        }
      }
      if (!allowed) throw new Error(`That rate plan is not on this reseller’s contract (${item.iccid}).`);
    }
  }

  const id = newId("sbj");
  const now = new Date().toISOString();
  const kinds = new Set(items.map((item) => item.action));
  const jobKind: BulkJobKind = kinds.size === 1 ? [...kinds][0]! : "mixed";

  await db
    .prepare(
      `INSERT INTO sim_bulk_jobs
        (id, tenant_id, kind, platform_plan_id, status, total, done, ok_count, failed_count,
         actor_email, created_at, updated_at, notified_at)
       VALUES (?, ?, ?, NULL, 'queued', ?, 0, 0, 0, ?, ?, ?, NULL)`,
    )
    .bind(id, tenantId, jobKind, items.length, actorEmail, now, now)
    .run();

  const stmts = items.map((item) => {
    const itemId = newId("sbi");
    return db
      .prepare(
        `INSERT INTO sim_bulk_job_items
          (id, job_id, iccid, action, platform_plan_id, status, error, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?)`,
      )
      .bind(itemId, id, item.iccid, item.action, item.platformPlanId ?? null, now);
  });
  await db.batch(stmts);

  await writeAudit(
    tenantId,
    actorEmail,
    jobKind === "rate_plan" ? "rate_plan" : "lifecycle",
    `Bulk job ${id}: ${items.length} SIM(s) · ${jobKind}`,
  );

  return (await getSimBulkJob(tenantId, id))!;
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

  const pending = await db
    .prepare(
      `SELECT id, iccid, action, platform_plan_id FROM sim_bulk_job_items
       WHERE job_id = ? AND status = 'pending'
       ORDER BY iccid ASC LIMIT ?`,
    )
    .bind(jobId, PROCESS_CHUNK)
    .all<{ id: string; iccid: string; action: string | null; platform_plan_id: string | null }>();
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
    const action = item.action ?? job.kind;
    try {
      if (action === "rate_plan") {
        const planId = item.platform_plan_id ?? job.platformPlanId;
        if (!planId) throw new Error("Reseller Plan missing.");
        await changeSimRatePlan(tenantId, actorEmail, {
          iccid: item.iccid,
          platformPlanId: planId,
          skipNotify: true,
        });
      } else if (action === "Activate" || action === "Deactivate") {
        await applyLifecycle(tenantId, actorEmail, {
          iccid: item.iccid,
          action,
          skipNotify: true,
        });
      } else {
        throw new Error(`Unknown action ${action}.`);
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

  const actionCounts = await db
    .prepare(
      `SELECT action, COUNT(*) as c FROM sim_bulk_job_items WHERE job_id = ? GROUP BY action`,
    )
    .bind(jobId)
    .all<{ action: string | null; c: number }>();
  const actionLabel =
    (actionCounts.results ?? [])
      .map((row) => `${row.action ?? "—"} × ${row.c}`)
      .join(", ") || job.kind;

  const failures = await db
    .prepare(
      `SELECT iccid, action, error FROM sim_bulk_job_items
       WHERE job_id = ? AND status = 'failed' ORDER BY iccid ASC LIMIT 20`,
    )
    .bind(jobId)
    .all<{ iccid: string; action: string | null; error: string | null }>();

  const failRows = (failures.results ?? [])
    .map(
      (item) =>
        `<tr><td style="padding:4px 8px;font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(item.iccid)}</td><td style="padding:4px 8px;font-size:12px;">${escapeHtml(item.action ?? "")}</td><td style="padding:4px 8px;color:#b91c1c;font-size:12px;">${escapeHtml(item.error ?? "failed")}</td></tr>`,
    )
    .join("");

  const subject = `Catalyst bulk update: ${orgName} · ${job.okCount} ok / ${job.failedCount} failed`;
  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;">
    <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#0d9488;font-weight:700;">ATN Catalyst</p>
    <h2 style="margin:8px 0 16px;color:#111827;">Bulk SIM update finished</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
      <tr><td style="padding:6px 0;color:#6b7280;">Organisation</td><td style="padding:6px 0;">${escapeHtml(orgName)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Actions</td><td style="padding:6px 0;">${escapeHtml(actionLabel)}</td></tr>
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
