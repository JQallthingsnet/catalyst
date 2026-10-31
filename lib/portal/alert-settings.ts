import { isValidEmail, normalizeEmail } from "@/lib/auth/codes";
import { getDB } from "@/lib/env";

/** Platform (super admin) alert scope — not a tenant id. */
export const PLATFORM_ALERT_SCOPE = "__platform__";

/** Form placeholder only — digests never use this unless the user saves it. */
export const SUGGESTED_ALERT_THRESHOLD_PCT = 80;

export type AlertKind = "pool" | "usage";

export type AlertSetting = {
  scopeId: string;
  kind: AlertKind;
  /** null = no digest threshold (event emails still use recipients). */
  thresholdPct: number | null;
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

/** Empty / null → null. Otherwise 1–200. */
export function parseOptionalThresholdPct(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n)) throw new Error("Enter a trigger threshold (%), or leave it blank.");
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 200) throw new Error("Threshold must be between 1 and 200%.");
  return rounded;
}

/** @deprecated Prefer parseOptionalThresholdPct — kept for callers that require a value. */
export function parseThresholdPct(value: unknown): number {
  const parsed = parseOptionalThresholdPct(value);
  if (parsed == null) throw new Error("Enter a trigger threshold (%).");
  return parsed;
}

export function parseRecipientsText(text: string): string[] {
  return clipEmails(text);
}

export function recipientsToText(emails: string[]): string {
  return emails.join("\n");
}

async function loadRow(scopeId: string, kind: AlertKind): Promise<AlertSetting | null> {
  const row = await getDB()
    .prepare(
      `SELECT scope_id, kind, threshold_pct, recipients_json, updated_at, updated_by
       FROM alert_settings WHERE scope_id = ? AND kind = ?`,
    )
    .bind(scopeId, kind)
    .first<{
      scope_id: string;
      kind: string;
      threshold_pct: number | null;
      recipients_json: string;
      updated_at: string | null;
      updated_by: string | null;
    }>();
  if (!row) return null;
  const rawThreshold = row.threshold_pct;
  const thresholdPct =
    rawThreshold == null || Number(rawThreshold) < 1 ? null : Math.round(Number(rawThreshold));
  return {
    scopeId: row.scope_id,
    kind: row.kind === "usage" ? "usage" : "pool",
    thresholdPct,
    recipients: parseRecipientsJson(row.recipients_json),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Effective setting for digests + UI.
 * Missing row → no recipients and no threshold (digests stay off until Alerts are saved).
 */
export async function getAlertSetting(scopeId: string, kind: AlertKind): Promise<AlertSetting> {
  const stored = await loadRow(scopeId, kind);
  if (stored) return stored;

  return {
    scopeId,
    kind,
    thresholdPct: null,
    recipients: [],
    updatedAt: null,
    updatedBy: null,
  };
}

export async function getAlertSettingsForScope(
  scopeId: string,
  kinds: AlertKind[],
): Promise<Record<AlertKind, AlertSetting>> {
  const entries = await Promise.all(kinds.map(async (kind) => [kind, await getAlertSetting(scopeId, kind)] as const));
  return Object.fromEntries(entries) as Record<AlertKind, AlertSetting>;
}

/**
 * Save Alerts when threshold and/or recipients are set.
 * Digests need both; event emails (plan / lifecycle) need recipients only.
 */
export async function saveAlertSetting(input: {
  scopeId: string;
  kind: AlertKind;
  thresholdPct: number | null;
  recipients: string[] | string;
  updatedBy: string;
}): Promise<AlertSetting> {
  const scopeId = input.scopeId.trim();
  if (!scopeId) throw new Error("Alert scope is required.");
  if (input.kind !== "pool" && input.kind !== "usage") throw new Error("Unknown alert kind.");
  const thresholdPct = parseOptionalThresholdPct(input.thresholdPct);
  const recipients = Array.isArray(input.recipients)
    ? clipEmails(input.recipients)
    : parseRecipientsText(input.recipients);
  if (thresholdPct == null && recipients.length === 0) {
    throw new Error("Enter a trigger threshold (%) and/or at least one recipient email.");
  }
  const now = new Date().toISOString();
  await getDB()
    .prepare(
      `INSERT INTO alert_settings (scope_id, kind, threshold_pct, recipients_json, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(scope_id, kind) DO UPDATE SET
         threshold_pct = excluded.threshold_pct,
         recipients_json = excluded.recipients_json,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    // 0 = no digest threshold (works on older NOT NULL schemas; migration 0040 allows NULL).
    .bind(scopeId, input.kind, thresholdPct ?? 0, JSON.stringify(recipients), now, input.updatedBy)
    .run();
  return {
    scopeId,
    kind: input.kind,
    thresholdPct,
    recipients,
    updatedAt: now,
    updatedBy: input.updatedBy,
  };
}

/** True when a row exists (vs never saved). Empty recipients after save disables digests. */
export async function alertSettingIsConfigured(scopeId: string, kind: AlertKind): Promise<boolean> {
  const row = await loadRow(scopeId, kind);
  return row != null;
}
