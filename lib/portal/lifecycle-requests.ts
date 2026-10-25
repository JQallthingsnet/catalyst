import { sendSystemEmail } from "@/lib/auth/email";
import { getDB } from "@/lib/env";
import { lifecycleRequestTarget, type SimState } from "@/lib/portal/catalogue";
import { newId } from "@/lib/portal/ids";
import { getOrderNotifySetting } from "@/lib/portal/order-notify";
import { writeAudit } from "@/lib/portal/repo";
import { loadTenant } from "@/lib/portal/tenant";

export type LifecycleRequest = {
  id: string;
  tenantId: string;
  iccid: string;
  action: string;
  fromState: string;
  toState: string;
  status: string;
  actorEmail: string;
  createdAt: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function listPendingLifecycleRequests(tenantId: string): Promise<LifecycleRequest[]> {
  const rows = await getDB()
    .prepare(
      `SELECT id, tenant_id, iccid, action, from_state, to_state, status, actor_email, created_at
       FROM sim_lifecycle_requests
       WHERE tenant_id = ? AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 500`,
    )
    .bind(tenantId)
    .all<{
      id: string;
      tenant_id: string;
      iccid: string;
      action: string;
      from_state: string;
      to_state: string;
      status: string;
      actor_email: string;
      created_at: string;
    }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    iccid: row.iccid,
    action: row.action,
    fromState: row.from_state,
    toState: row.to_state,
    status: row.status,
    actorEmail: row.actor_email,
    createdAt: row.created_at,
  }));
}

/**
 * Queue a reseller lifecycle action for ATN. Emails Order SIMs recipients with a
 * summary of all pending requests for this organisation (bulk processing list).
 * Does not change local SIM state — Jasper remains the radio source.
 */
export async function requestLifecycle(
  tenantId: string,
  actorEmail: string,
  input: { iccid: string; action: string },
): Promise<{ requestId: string; pendingCount: number; emailed: number }> {
  const db = getDB();
  const iccid = input.iccid.replace(/\s/g, "");
  const action = input.action.trim();
  if (!iccid) throw new Error("ICCID is required.");
  if (!action) throw new Error("Choose a lifecycle action.");

  const sim = await db
    .prepare("SELECT id, state FROM sims WHERE tenant_id = ? AND iccid = ?")
    .bind(tenantId, iccid)
    .first<{ id: string; state: SimState }>();
  if (!sim) throw new Error("SIM not found in this organisation.");

  const toState = lifecycleRequestTarget(action, sim.state);
  if (!toState) {
    throw new Error(`${action} is not valid from ${sim.state}.`);
  }

  const existing = await db
    .prepare(
      `SELECT id FROM sim_lifecycle_requests
       WHERE tenant_id = ? AND iccid = ? AND action = ? AND status = 'pending'`,
    )
    .bind(tenantId, iccid, action)
    .first<{ id: string }>();
  if (existing) {
    throw new Error(`A pending ${action} request already exists for this ICCID.`);
  }

  const id = newId("lcr");
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO sim_lifecycle_requests
        (id, tenant_id, iccid, action, from_state, to_state, status, actor_email, created_at, notified_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)`,
    )
    .bind(id, tenantId, iccid, action, sim.state, toState, actorEmail, createdAt)
    .run();

  await writeAudit(
    tenantId,
    actorEmail,
    "lifecycle_request",
    `Requested ${action} ${iccid} (${sim.state} → ${toState}) — queued for ATN`,
  );

  const pending = await listPendingLifecycleRequests(tenantId);
  const tenant = await loadTenant(tenantId);
  const emailed = await notifyLifecycleRequestBatch({
    tenantName: tenant?.name ?? tenantId,
    latest: {
      iccid,
      action,
      fromState: sim.state,
      toState,
      actorEmail,
    },
    pending,
  });

  if (emailed > 0) {
    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE sim_lifecycle_requests SET notified_at = ?
         WHERE tenant_id = ? AND status = 'pending' AND notified_at IS NULL`,
      )
      .bind(now, tenantId)
      .run();
  }

  return { requestId: id, pendingCount: pending.length, emailed };
}

async function notifyLifecycleRequestBatch(input: {
  tenantName: string;
  latest: {
    iccid: string;
    action: string;
    fromState: string;
    toState: string;
    actorEmail: string;
  };
  pending: LifecycleRequest[];
}): Promise<number> {
  const setting = await getOrderNotifySetting();
  if (setting.recipients.length === 0) return 0;

  const rowsHtml = input.pending
    .map(
      (row, index) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;">${index + 1}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(row.iccid)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(row.action)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(row.fromState)} → ${escapeHtml(row.toState)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;">${escapeHtml(row.actorEmail)}</td>
      </tr>`,
    )
    .join("");

  const subject = `Catalyst lifecycle requests: ${input.tenantName} · ${input.pending.length} pending`;
  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:0 auto;">
    <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#0d9488;font-weight:700;">ATN Catalyst</p>
    <h2 style="margin:8px 0 12px;color:#111827;">Lifecycle requests for bulk processing</h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.5;">
      <strong>${escapeHtml(input.tenantName)}</strong> — latest:
      <strong>${escapeHtml(input.latest.action)}</strong> on
      <span style="font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(input.latest.iccid)}</span>
      (${escapeHtml(input.latest.fromState)} → ${escapeHtml(input.latest.toState)})
      by ${escapeHtml(input.latest.actorEmail)}.
    </p>
    <p style="margin:0 0 12px;color:#374151;font-size:14px;">
      All <strong>${input.pending.length}</strong> pending request${input.pending.length === 1 ? "" : "s"} for this organisation:
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#111827;border:1px solid #e5e7eb;border-radius:8px;">
      <thead>
        <tr style="background:#f9fafb;text-align:left;">
          <th style="padding:8px 10px;">#</th>
          <th style="padding:8px 10px;">ICCID</th>
          <th style="padding:8px 10px;">Action</th>
          <th style="padding:8px 10px;">From → To</th>
          <th style="padding:8px 10px;">By</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p style="margin:16px 0 0;color:#6b7280;font-size:13px;">
      Process these in Jasper / Control Center, then update Catalyst SIM state (Sync or lifecycle) when done.
    </p>
  </div>`;

  let sent = 0;
  for (const to of setting.recipients) {
    try {
      await sendSystemEmail(to, subject, html);
      sent += 1;
    } catch (err) {
      console.error("[lifecycle-notify]", to, err instanceof Error ? err.message : err);
    }
  }
  return sent;
}
