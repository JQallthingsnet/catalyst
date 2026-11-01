import { sendSystemEmail } from "@/lib/auth/email";
import { getDB } from "@/lib/env";
import { lifecycleTarget, type SimState } from "@/lib/portal/catalogue";
import { newId } from "@/lib/portal/ids";
import { loadPlatformPlanRecord, tenantHasPlatformPlan } from "@/lib/portal/platform-plans";
import { changeSimRatePlan } from "@/lib/portal/rate-plan-change";
import { recipientsFromAlertSetup } from "@/lib/portal/rate-plan-notify";
import { applyLifecycle, changeSimRetailPlan, writeAudit } from "@/lib/portal/repo";
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
  return (
    value === "Activate" ||
    value === "Deactivate" ||
    value === "rate_plan" ||
    value === "retail_plan"
  );
}

export async function createSimBulkJob(
  tenantId: string,
  actorEmail: string,
  input: { items: BulkJobItemInput[] },
): Promise<BulkJobStatus> {
  // One ICCID may appear twice (lifecycle + plan) in the same bulk run.
  const seen = new Set<string>();
  const items: BulkJobItemInput[] = [];
  for (const raw of input.items) {
    const iccid = raw.iccid.replace(/\s/g, "");
    if (!iccid) continue;
    if (!isItemAction(raw.action)) throw new Error(`Invalid action for ${iccid}.`);
    const key = `${iccid}:${raw.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      iccid,
      action: raw.action,
      platformPlanId: raw.platformPlanId?.trim() || undefined,
    });
  }
  if (items.length === 0) throw new Error("Select at least one SIM with an action.");
  const uniqueIccids = [...new Set(items.map((item) => item.iccid))];
  if (uniqueIccids.length > BULK_SIM_CAP) {
    throw new Error(`Max ${BULK_SIM_CAP} SIMs per update.`);
  }

  const db = getDB();
  const placeholders = uniqueIccids.map(() => "?").join(",");
  const owned = await db
    .prepare(
      `SELECT iccid, state, customer_id FROM sims WHERE tenant_id = ? AND iccid IN (${placeholders})`,
    )
    .bind(tenantId, ...uniqueIccids)
    .all<{ iccid: string; state: SimState; customer_id: string | null }>();
  const byIccid = new Map((owned.results ?? []).map((row) => [row.iccid, row]));

  const platformPlanCache = new Map<string, boolean>();
  const retailPlanCache = new Map<string, { ok: boolean; name: string }>();
  for (const item of items) {
    const sim = byIccid.get(item.iccid);
    if (!sim) {
      throw new Error(`SIM ${item.iccid} is not in this organisation.`);
    }
    if (item.action === "Activate" || item.action === "Deactivate") {
      if (!lifecycleTarget(item.action, sim.state)) {
        throw new Error(`${item.action} is not valid from ${sim.state} (${item.iccid}).`);
      }
      continue;
    }

    const planId = item.platformPlanId;
    if (item.action === "retail_plan") {
      if (!planId) throw new Error(`Choose a retail plan for ${item.iccid}.`);
      if (!sim.customer_id) {
        throw new Error(`Assign ${item.iccid} to a customer before changing the retail plan.`);
      }
      let cached = retailPlanCache.get(planId);
      if (!cached) {
        const plan = await db
          .prepare(
            `SELECT id, name, platform_plan_id FROM plans WHERE id = ? AND tenant_id = ?`,
          )
          .bind(planId, tenantId)
          .first<{ id: string; name: string; platform_plan_id: string | null }>();
        if (!plan?.platform_plan_id) {
          cached = { ok: false, name: planId };
        } else {
          const contracted = await tenantHasPlatformPlan(tenantId, plan.platform_plan_id);
          cached = { ok: contracted, name: plan.name };
        }
        retailPlanCache.set(planId, cached);
      }
      if (!cached.ok) {
        throw new Error(`That retail plan is not valid for this organisation (${item.iccid}).`);
      }
      continue;
    }

    if (!planId) throw new Error(`Choose a Reseller Plan for ${item.iccid}.`);
    let allowed = platformPlanCache.get(planId);
    if (allowed == null) {
      allowed = await tenantHasPlatformPlan(tenantId, planId);
      platformPlanCache.set(planId, allowed);
      if (allowed) {
        const plan = await loadPlatformPlanRecord(planId);
        if (!plan?.active) throw new Error(`Reseller Plan is deactivated (${planId}).`);
      }
    }
    if (!allowed) throw new Error(`That rate plan is not on this reseller’s contract (${item.iccid}).`);
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
    jobKind === "rate_plan" ? "rate_plan" : jobKind === "retail_plan" ? "assign" : "lifecycle",
    `Bulk job ${id}: ${uniqueIccids.length} SIM(s) · ${items.length} change(s) · ${jobKind}`,
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
      } else if (action === "retail_plan") {
        const planId = item.platform_plan_id ?? job.platformPlanId;
        if (!planId) throw new Error("Retail plan missing.");
        await changeSimRetailPlan(tenantId, actorEmail, {
          iccid: item.iccid,
          planId,
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
      .map((row) => {
        const action =
          row.action === "retail_plan"
            ? "Retail plan"
            : row.action === "rate_plan"
              ? "Reseller Plan"
              : (row.action ?? "—");
        return `${action} × ${row.c}`;
      })
      .join(", ") || job.kind;

  const DETAIL_CAP = 50;
  const details = await db
    .prepare(
      `SELECT iccid, action, platform_plan_id, status, error FROM sim_bulk_job_items
       WHERE job_id = ?
       ORDER BY
         CASE status WHEN 'failed' THEN 0 WHEN 'ok' THEN 1 ELSE 2 END,
         iccid ASC
       LIMIT ?`,
    )
    .bind(jobId, DETAIL_CAP)
    .all<{
      iccid: string;
      action: string | null;
      platform_plan_id: string | null;
      status: string;
      error: string | null;
    }>();

  const planNameCache = new Map<string, string>();
  async function actionDetail(action: string | null, platformPlanId: string | null): Promise<string> {
    if ((action === "rate_plan" || action === "retail_plan") && platformPlanId) {
      const cacheKey = `${action}:${platformPlanId}`;
      let name = planNameCache.get(cacheKey);
      if (!name) {
        if (action === "retail_plan") {
          const plan = await db
            .prepare(`SELECT name FROM plans WHERE id = ?`)
            .bind(platformPlanId)
            .first<{ name: string }>();
          name = plan?.name?.trim() || platformPlanId;
        } else {
          const plan = await loadPlatformPlanRecord(platformPlanId);
          name = plan?.name?.trim() || platformPlanId;
        }
        planNameCache.set(cacheKey, name);
      }
      return action === "retail_plan" ? `Retail plan → ${name}` : `Reseller Plan → ${name}`;
    }
    return action ?? "—";
  }

  const detailRows: string[] = [];
  for (const item of details.results ?? []) {
    const label = await actionDetail(item.action, item.platform_plan_id);
    const statusColor = item.status === "failed" ? "#b91c1c" : item.status === "ok" ? "#047857" : "#6b7280";
    const statusNote =
      item.status === "failed"
        ? escapeHtml(item.error ?? "failed")
        : item.status === "ok"
          ? "ok"
          : escapeHtml(item.status);
    detailRows.push(
      `<tr>
        <td style="padding:4px 8px;font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(item.iccid)}</td>
        <td style="padding:4px 8px;font-size:12px;">${escapeHtml(label)}</td>
        <td style="padding:4px 8px;font-size:12px;color:${statusColor};">${statusNote}</td>
      </tr>`,
    );
  }
  const hiddenDetails = Math.max(0, job.total - (details.results?.length ?? 0));

  const subject = `Catalyst bulk update: ${orgName} · ${job.okCount} ok / ${job.failedCount} failed`;
  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;">
    <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#0d9488;font-weight:700;">ATN Catalyst</p>
    <h2 style="margin:8px 0 16px;color:#111827;">Bulk SIM update finished</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
      <tr><td style="padding:6px 0;color:#6b7280;">Organisation</td><td style="padding:6px 0;">${escapeHtml(orgName)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Actions</td><td style="padding:6px 0;">${escapeHtml(actionLabel)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Result</td><td style="padding:6px 0;">${job.okCount} ok · ${job.failedCount} failed · ${job.total} total</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">By</td><td style="padding:6px 0;">${escapeHtml(job.actorEmail)}</td></tr>
    </table>
    ${
      detailRows.length
        ? `<p style="margin:16px 0 8px;font-size:13px;color:#6b7280;">Changes by ICCID</p>
           <table style="width:100%;border-collapse:collapse;">
             <tr>
               <th style="text-align:left;padding:4px 8px;font-size:11px;color:#6b7280;">ICCID</th>
               <th style="text-align:left;padding:4px 8px;font-size:11px;color:#6b7280;">Action</th>
               <th style="text-align:left;padding:4px 8px;font-size:11px;color:#6b7280;">Status</th>
             </tr>
             ${detailRows.join("")}
           </table>
           ${
             hiddenDetails > 0
               ? `<p style="margin:8px 0 0;font-size:12px;color:#6b7280;">+${hiddenDetails} more in Catalyst Logs / SIMs.</p>`
               : ""
           }`
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
