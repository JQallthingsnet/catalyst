import { sendSystemEmail } from "@/lib/auth/email";
import {
  getAlertSetting,
  PLATFORM_ALERT_SCOPE,
} from "@/lib/portal/alert-settings";
import { getOrderNotifySetting } from "@/lib/portal/order-notify";
import { loadTenant } from "@/lib/portal/tenant";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Recipients from Alerts setup:
 * - Super admin Order SIMs recipients (same Alerts page)
 * - Super admin Pool usage recipients
 * - Reseller Pool + Usage recipients for the SIM's organisation
 */
export async function recipientsFromAlertSetup(tenantId: string): Promise<string[]> {
  const [orderNotify, platformPool, resellerPool, resellerUsage] = await Promise.all([
    getOrderNotifySetting(),
    getAlertSetting(PLATFORM_ALERT_SCOPE, "pool"),
    getAlertSetting(tenantId, "pool"),
    getAlertSetting(tenantId, "usage"),
  ]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of [
    ...orderNotify.recipients,
    ...platformPool.recipients,
    ...resellerPool.recipients,
    ...resellerUsage.recipients,
  ]) {
    const key = email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(email.trim());
  }
  return out;
}

/** Soft-fail email after a Catalyst Reseller Plan change (Logs → Reseller Plan). */
export async function notifyResellerPlanChange(input: {
  tenantId: string;
  iccid: string;
  fromPlan: string | null;
  toPlan: string;
  actorEmail: string;
  clearedRetailPlan?: boolean;
  snapshotNote?: string | null;
}): Promise<{ sent: number; errors: string[] }> {
  const recipients = await recipientsFromAlertSetup(input.tenantId);
  if (recipients.length === 0) return { sent: 0, errors: [] };

  const tenant = await loadTenant(input.tenantId);
  const orgName = tenant?.name?.trim() || "Organisation";
  const fromLabel = input.fromPlan?.trim() || "—";
  const toLabel = input.toPlan.trim() || "—";
  const notes: string[] = [];
  if (input.clearedRetailPlan) notes.push("Retail plan cleared on this SIM.");
  if (input.snapshotNote?.trim()) notes.push(input.snapshotNote.trim());

  const subject = `Catalyst Reseller Plan: ${orgName} · ${input.iccid}`;
  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;">
    <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#0d9488;font-weight:700;">ATN Catalyst</p>
    <h2 style="margin:8px 0 16px;color:#111827;">Reseller Plan changed</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
      <tr><td style="padding:6px 0;color:#6b7280;">Organisation</td><td style="padding:6px 0;">${escapeHtml(orgName)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">ICCID</td><td style="padding:6px 0;font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(input.iccid)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">From</td><td style="padding:6px 0;">${escapeHtml(fromLabel)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">To</td><td style="padding:6px 0;">${escapeHtml(toLabel)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Changed by</td><td style="padding:6px 0;">${escapeHtml(input.actorEmail)}</td></tr>
    </table>
    ${
      notes.length
        ? `<p style="margin:16px 0 0;color:#374151;font-size:13px;">${notes.map((n) => escapeHtml(n)).join("<br/>")}</p>`
        : ""
    }
    <p style="margin:20px 0 0;color:#6b7280;font-size:13px;">
      Billing follows the Catalyst Reseller Plan. Open Plan changes / Logs in Catalyst for the full record.
    </p>
  </div>`;

  let sent = 0;
  const errors: string[] = [];
  for (const to of recipients) {
    try {
      await sendSystemEmail(to, subject, html);
      sent += 1;
    } catch (err) {
      errors.push(`${to}: ${err instanceof Error ? err.message : "send failed"}`);
    }
  }
  return { sent, errors };
}

/** Soft-fail email after SIM lifecycle apply or reseller request (Activate / Deactivate). */
export async function notifySimLifecycleChange(input: {
  tenantId: string;
  iccid: string;
  action: string;
  fromState: string;
  toState: string;
  actorEmail: string;
  /** Reseller queued for ATN vs super admin applied. */
  mode: "applied" | "requested";
}): Promise<{ sent: number; errors: string[] }> {
  const recipients = await recipientsFromAlertSetup(input.tenantId);
  if (recipients.length === 0) return { sent: 0, errors: [] };

  const tenant = await loadTenant(input.tenantId);
  const orgName = tenant?.name?.trim() || "Organisation";
  const headline =
    input.mode === "requested" ? "SIM lifecycle requested" : "SIM lifecycle changed";
  const subject = `Catalyst ${input.action}: ${orgName} · ${input.iccid}`;
  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;">
    <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#0d9488;font-weight:700;">ATN Catalyst</p>
    <h2 style="margin:8px 0 16px;color:#111827;">${escapeHtml(headline)}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
      <tr><td style="padding:6px 0;color:#6b7280;">Organisation</td><td style="padding:6px 0;">${escapeHtml(orgName)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">ICCID</td><td style="padding:6px 0;font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(input.iccid)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Action</td><td style="padding:6px 0;">${escapeHtml(input.action)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">State</td><td style="padding:6px 0;">${escapeHtml(input.fromState)} → ${escapeHtml(input.toState)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">By</td><td style="padding:6px 0;">${escapeHtml(input.actorEmail)}</td></tr>
    </table>
    <p style="margin:20px 0 0;color:#6b7280;font-size:13px;">
      ${
        input.mode === "requested"
          ? "Queued for ATN. Open Logs / lifecycle requests in Catalyst."
          : "Open SIMs / Logs in Catalyst for the full record."
      }
    </p>
  </div>`;

  let sent = 0;
  const errors: string[] = [];
  for (const to of recipients) {
    try {
      await sendSystemEmail(to, subject, html);
      sent += 1;
    } catch (err) {
      errors.push(`${to}: ${err instanceof Error ? err.message : "send failed"}`);
    }
  }
  return { sent, errors };
}
