import { sendSystemEmail } from "@/lib/auth/email";
import { getDB } from "@/lib/env";
import { sydneyDayKey } from "@/lib/portal/time";

export const SIM_ALLOWANCE_ALERT_PCT = 80;

/** Daily ≥80% rate-plan allowance digest (platform). */
const SIM_ALLOWANCE_ALERT_TO = ["jerry.qiu@allthingsnet.io"];

/** Sentinel ICCID: one digest email per Sydney day. */
const DAILY_DIGEST_MARKER = "__daily_digest__";

/** Super admin → Jasper rate plan; reseller → modem_ID. */
export type UsageAllowanceBasis = "rate_plan" | "modem";

export type SimModemUsage = {
  iccid: string;
  customer: string | null;
  modemId: string | null;
  ratePlan: string | null;
  ctdUsageMb: number;
  allowanceMb: number | null;
  pct: number | null;
  status: string;
  basis: UsageAllowanceBasis;
};

export async function listSimModemUsage(input?: {
  basis?: UsageAllowanceBasis;
  customer?: string;
  q?: string;
  minPct?: number;
  limit?: number;
}): Promise<SimModemUsage[]> {
  const basis: UsageAllowanceBasis = input?.basis ?? "modem";
  const customer = input?.customer?.trim() ?? "";
  const q = input?.q?.trim() ?? "";
  const minPct = input?.minPct;
  const limit = Math.min(Math.max(input?.limit ?? 500, 1), 2000);

  const allowanceJoin =
    basis === "rate_plan"
      ? "LEFT JOIN rate_plan_allowances a ON a.rate_plan = d.rate_plan"
      : "LEFT JOIN modem_allowances a ON a.modem_id = d.modem_id";

  const rows = await getDB()
    .prepare(
      `SELECT d.iccid, d.customer, d.modem_id, d.rate_plan, d.status,
              IFNULL(d.ctd_usage_mb, 0) AS ctd_usage_mb,
              a.allowance_mb AS allowance_mb
       FROM cc_devices d
       ${allowanceJoin}
       WHERE (? = '' OR IFNULL(d.customer, '') = ?)
         AND (
           ? = ''
           OR d.iccid LIKE ?
           OR IFNULL(d.modem_id, '') LIKE ?
           OR IFNULL(d.customer, '') LIKE ?
           OR IFNULL(d.rate_plan, '') LIKE ?
         )
       ORDER BY
         CASE WHEN a.allowance_mb IS NOT NULL AND a.allowance_mb > 0
              THEN IFNULL(d.ctd_usage_mb, 0) / a.allowance_mb
              ELSE -1 END DESC,
         d.iccid ASC
       LIMIT ?`,
    )
    .bind(
      customer,
      customer,
      q,
      `%${q.replace(/\s/g, "")}%`,
      `%${q}%`,
      `%${q}%`,
      `%${q}%`,
      limit,
    )
    .all<{
      iccid: string;
      customer: string | null;
      modem_id: string | null;
      rate_plan: string | null;
      status: string;
      ctd_usage_mb: number;
      allowance_mb: number | null;
    }>();

  const mapped = (rows.results ?? []).map((row) => {
    const allowanceMb = row.allowance_mb;
    const ctdUsageMb = row.ctd_usage_mb ?? 0;
    const pct =
      allowanceMb != null && allowanceMb > 0 ? Math.round((ctdUsageMb / allowanceMb) * 1000) / 10 : null;
    return {
      iccid: row.iccid,
      customer: row.customer,
      modemId: row.modem_id,
      ratePlan: row.rate_plan,
      ctdUsageMb,
      allowanceMb,
      pct,
      status: row.status,
      basis,
    };
  });

  if (minPct == null) return mapped;
  return mapped.filter((row) => row.pct != null && row.pct >= minPct);
}

type AlertCandidate = SimModemUsage & { allowanceMb: number; pct: number };

function buildSimAllowanceAlertEmail(input: {
  sims: AlertCandidate[];
  day: string;
  threshold: number;
  basis: UsageAllowanceBasis;
}): { subject: string; html: string } {
  const { sims, day, threshold, basis } = input;
  const keyLabel = basis === "rate_plan" ? "Rate plan" : "modem_ID";
  const title =
    basis === "rate_plan" ? "Rate plan allowance alert" : "Modem allowance alert";
  const rowsHtml = sims
    .map((sim, index) => {
      const pctColor = sim.pct >= 100 ? "#b91c1c" : sim.pct >= threshold ? "#b45309" : "#047857";
      const key = basis === "rate_plan" ? sim.ratePlan ?? "—" : sim.modemId ?? "—";
      return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;">${index + 1}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#111827;">${escapeHtml(sim.iccid)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${escapeHtml(sim.customer ?? "—")}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${escapeHtml(key)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;">${sim.ctdUsageMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;">${sim.allowanceMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${pctColor};">${sim.pct}%</td>
      </tr>`;
    })
    .join("");

  const subject = `Catalyst daily: ${sims.length} SIM${sims.length === 1 ? "" : "s"} ≥${threshold}% ${
    basis === "rate_plan" ? "rate plan" : "modem"
  } allowance (${day})`;

  const html = `
  <div style="background:#f3f4f6;padding:24px 12px;">
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#070B14;padding:20px 24px;">
        <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#2EE6D6;font-weight:700;">ATN Catalyst</p>
        <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:600;">${title}</h1>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.5;">
          Daily digest for Sydney day <strong>${day}</strong>:
          ${sims.length} SIM${sims.length === 1 ? " is" : "s are"} at <strong>≥${threshold}%</strong> of
          ${basis === "rate_plan" ? "Jasper rate plan" : "modem_ID"} allowance (CTD MB ÷ allowance MB).
        </p>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 20px;font-size:13px;">
          <thead>
            <tr style="text-align:left;background:#f9fafb;color:#6b7280;">
              <th style="padding:10px 12px;font-weight:600;">#</th>
              <th style="padding:10px 12px;font-weight:600;">ICCID</th>
              <th style="padding:10px 12px;font-weight:600;">CC customer</th>
              <th style="padding:10px 12px;font-weight:600;">${keyLabel}</th>
              <th style="padding:10px 12px;font-weight:600;text-align:right;">CTD MB</th>
              <th style="padding:10px 12px;font-weight:600;text-align:right;">Allowance</th>
              <th style="padding:10px 12px;font-weight:600;text-align:right;">%</th>
            </tr>
          </thead>
          <tbody>${rowsHtml || `<tr><td colspan="7" style="padding:16px;color:#6b7280;">No SIMs with an allowance.</td></tr>`}</tbody>
        </table>
        <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
          Sent once per Sydney day to jerry.qiu@allthingsnet.io. Open Catalyst → Usage for the live list
          ${sims.length > 50 ? ` (email shows top 50 of ${sims.length}).` : "."}
        </p>
      </div>
    </div>
  </div>`;

  return { subject, html };
}

async function sendAlertHtml(subject: string, html: string): Promise<boolean> {
  let emailed = false;
  for (const to of SIM_ALLOWANCE_ALERT_TO) {
    try {
      await sendSystemEmail(to, subject, html);
      emailed = true;
    } catch (err) {
      console.error("[sim-usage] alert email failed", to, err);
    }
  }
  return emailed;
}

/** SIMs at ≥threshold% of rate-plan allowance (SQL filter — not capped by Usage page limit). */
async function listRatePlanBreachCandidates(threshold: number): Promise<AlertCandidate[]> {
  const ratio = threshold / 100;
  const rows = await getDB()
    .prepare(
      `SELECT d.iccid, d.customer, d.modem_id, d.rate_plan, d.status,
              IFNULL(d.ctd_usage_mb, 0) AS ctd_usage_mb,
              a.allowance_mb AS allowance_mb
       FROM cc_devices d
       INNER JOIN rate_plan_allowances a ON a.rate_plan = d.rate_plan
       WHERE a.allowance_mb > 0
         AND IFNULL(d.ctd_usage_mb, 0) / a.allowance_mb >= ?
         AND d.rate_plan IS NOT NULL AND TRIM(d.rate_plan) != ''
       ORDER BY IFNULL(d.ctd_usage_mb, 0) / a.allowance_mb DESC, d.iccid ASC
       LIMIT 500`,
    )
    .bind(ratio)
    .all<{
      iccid: string;
      customer: string | null;
      modem_id: string | null;
      rate_plan: string | null;
      status: string;
      ctd_usage_mb: number;
      allowance_mb: number;
    }>();

  return (rows.results ?? []).map((row) => {
    const allowanceMb = row.allowance_mb;
    const ctdUsageMb = row.ctd_usage_mb ?? 0;
    const pct = Math.round((ctdUsageMb / allowanceMb) * 1000) / 10;
    return {
      iccid: row.iccid,
      customer: row.customer,
      modemId: row.modem_id,
      ratePlan: row.rate_plan,
      ctdUsageMb,
      allowanceMb,
      pct,
      status: row.status,
      basis: "rate_plan" as const,
    };
  });
}

/**
 * Daily platform digest: all SIMs at ≥threshold% of Jasper rate-plan allowance.
 * Emails jerry.qiu@allthingsnet.io once per Sydney calendar day (cron).
 */
export async function notifySimAllowanceAlerts(
  threshold = SIM_ALLOWANCE_ALERT_PCT,
  opts?: { force?: boolean },
): Promise<{
  checked: number;
  newlyAlerted: number;
  emailed: boolean;
  day: string;
  skipReason?: string;
  error?: string;
}> {
  const basis: UsageAllowanceBasis = "rate_plan";
  const day = sydneyDayKey();
  const db = getDB();
  const force = opts?.force === true;

  if (force) {
    await db
      .prepare("DELETE FROM sim_allowance_alerts WHERE iccid = ? AND day = ? AND threshold = ?")
      .bind(DAILY_DIGEST_MARKER, day, threshold)
      .run();
  } else {
    const alreadySent = await db
      .prepare(
        `SELECT 1 AS ok FROM sim_allowance_alerts
         WHERE iccid = ? AND day = ? AND threshold = ?`,
      )
      .bind(DAILY_DIGEST_MARKER, day, threshold)
      .first<{ ok: number }>();
    if (alreadySent) {
      return {
        checked: 0,
        newlyAlerted: 0,
        emailed: false,
        day,
        skipReason: "already_sent_today",
      };
    }
  }

  const candidates = await listRatePlanBreachCandidates(threshold);

  if (candidates.length === 0) {
    console.log(
      `[sim-usage] daily digest skipped: 0 SIMs ≥${threshold}% (day ${day})`,
    );
    return {
      checked: 0,
      newlyAlerted: 0,
      emailed: false,
      day,
      skipReason: "no_breaches",
    };
  }

  const { subject, html } = buildSimAllowanceAlertEmail({
    sims: candidates.slice(0, 50),
    day,
    threshold,
    basis,
  });

  let emailed = false;
  try {
    emailed = await sendAlertHtml(subject, html);
    if (!emailed) {
      return {
        checked: candidates.length,
        newlyAlerted: candidates.length,
        emailed: false,
        day,
        error: "SMTP send failed for all recipients.",
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "SMTP send failed.";
    console.error("[sim-usage] daily digest send failed", message);
    return {
      checked: candidates.length,
      newlyAlerted: candidates.length,
      emailed: false,
      day,
      error: message,
    };
  }

  const now = new Date().toISOString();
  const stmts = [
    db
      .prepare(
        `INSERT INTO sim_allowance_alerts
           (iccid, day, threshold, pct, ctd_usage_mb, allowance_mb, modem_id, customer, emailed_at, rate_plan, basis)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(iccid, day, threshold) DO UPDATE SET emailed_at = excluded.emailed_at`,
      )
      .bind(DAILY_DIGEST_MARKER, day, threshold, 0, 0, 0, null, null, now, null, basis),
    ...candidates.map((sim) =>
      db
        .prepare(
          `INSERT INTO sim_allowance_alerts
             (iccid, day, threshold, pct, ctd_usage_mb, allowance_mb, modem_id, customer, emailed_at, rate_plan, basis)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(iccid, day, threshold) DO UPDATE SET
             pct = excluded.pct,
             ctd_usage_mb = excluded.ctd_usage_mb,
             allowance_mb = excluded.allowance_mb,
             emailed_at = excluded.emailed_at`,
        )
        .bind(
          sim.iccid,
          day,
          threshold,
          sim.pct,
          sim.ctdUsageMb,
          sim.allowanceMb,
          sim.modemId,
          sim.customer,
          now,
          sim.ratePlan,
          basis,
        ),
    ),
  ];
  for (let i = 0; i < stmts.length; i += 40) {
    await db.batch(stmts.slice(i, i + 40));
  }

  console.log(
    `[sim-usage] daily digest emailed: ${candidates.length} SIMs ≥${threshold}% → ${SIM_ALLOWANCE_ALERT_TO.join(",")} (day ${day})`,
  );
  return {
    checked: candidates.length,
    newlyAlerted: candidates.length,
    emailed: true,
    day,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
