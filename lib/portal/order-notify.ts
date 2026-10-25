import { isValidEmail, normalizeEmail } from "@/lib/auth/codes";
import { sendSystemEmail } from "@/lib/auth/email";
import { getDB } from "@/lib/env";
import { PLATFORM_ALERT_SCOPE } from "@/lib/portal/alert-settings";

export type OrderNotifySetting = {
  scopeId: string;
  recipients: string[];
  updatedAt: string | null;
  updatedBy: string | null;
};

function clipEmails(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw.map((item) => String(item))
    : typeof raw === "string"
      ? raw.split(/[\n,;]+/)
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const email = normalizeEmail(item);
    if (!isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
    if (out.length >= 40) break;
  }
  return out;
}

function parseRecipientsJson(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  try {
    return clipEmails(JSON.parse(value) as unknown);
  } catch {
    return clipEmails(value);
  }
}

export function parseOrderNotifyRecipientsText(text: string): string[] {
  return clipEmails(text);
}

export async function getOrderNotifySetting(
  scopeId: string = PLATFORM_ALERT_SCOPE,
): Promise<OrderNotifySetting> {
  const row = await getDB()
    .prepare(
      `SELECT scope_id, recipients_json, updated_at, updated_by
       FROM order_notify_settings WHERE scope_id = ?`,
    )
    .bind(scopeId)
    .first<{
      scope_id: string;
      recipients_json: string;
      updated_at: string | null;
      updated_by: string | null;
    }>();
  if (!row) {
    return {
      scopeId,
      recipients: [],
      updatedAt: null,
      updatedBy: null,
    };
  }
  return {
    scopeId: row.scope_id,
    recipients: parseRecipientsJson(row.recipients_json),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function saveOrderNotifySetting(input: {
  scopeId?: string;
  recipients: string[] | string;
  updatedBy: string;
}): Promise<OrderNotifySetting> {
  const scopeId = (input.scopeId ?? PLATFORM_ALERT_SCOPE).trim() || PLATFORM_ALERT_SCOPE;
  const recipients = Array.isArray(input.recipients)
    ? clipEmails(input.recipients)
    : parseOrderNotifyRecipientsText(input.recipients);
  const now = new Date().toISOString();
  await getDB()
    .prepare(
      `INSERT INTO order_notify_settings (scope_id, recipients_json, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(scope_id) DO UPDATE SET
         recipients_json = excluded.recipients_json,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .bind(scopeId, JSON.stringify(recipients), now, input.updatedBy)
    .run();
  return {
    scopeId,
    recipients,
    updatedAt: now,
    updatedBy: input.updatedBy,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function notifySuperAdminsOfOrder(input: {
  orderId: string;
  tenantName: string;
  skuName: string;
  quantity: number;
  destination: string;
  poNumber: string | null;
  createdBy: string;
}): Promise<{ sent: number; errors: string[] }> {
  const setting = await getOrderNotifySetting();
  if (setting.recipients.length === 0) {
    return { sent: 0, errors: [] };
  }

  const subject = `Catalyst Order SIMs: ${input.tenantName} · ${input.skuName} × ${input.quantity}`;
  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;">
    <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#0d9488;font-weight:700;">ATN Catalyst</p>
    <h2 style="margin:8px 0 16px;color:#111827;">New Order SIMs</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
      <tr><td style="padding:6px 0;color:#6b7280;">Organisation</td><td style="padding:6px 0;">${escapeHtml(input.tenantName)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">SKU</td><td style="padding:6px 0;">${escapeHtml(input.skuName)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Quantity</td><td style="padding:6px 0;">${input.quantity.toLocaleString("en-AU")}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Ship / destination</td><td style="padding:6px 0;">${escapeHtml(input.destination)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">PO</td><td style="padding:6px 0;">${escapeHtml(input.poNumber ?? "—")}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Submitted by</td><td style="padding:6px 0;">${escapeHtml(input.createdBy)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Order id</td><td style="padding:6px 0;font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(input.orderId)}</td></tr>
    </table>
    <p style="margin:20px 0 0;color:#6b7280;font-size:13px;">Open Catalyst → Orders to review.</p>
  </div>`;

  let sent = 0;
  const errors: string[] = [];
  for (const to of setting.recipients) {
    try {
      await sendSystemEmail(to, subject, html);
      sent += 1;
    } catch (err) {
      errors.push(`${to}: ${err instanceof Error ? err.message : "send failed"}`);
    }
  }
  return { sent, errors };
}
