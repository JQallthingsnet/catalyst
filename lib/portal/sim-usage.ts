import { sendSystemEmail } from "@/lib/auth/email";
import { getDB } from "@/lib/env";
import { sydneyDayKey } from "@/lib/portal/time";

export const SIM_ALLOWANCE_ALERT_PCT = 80;

/** Temporary: alert only this inbox (not every super admin). */
const SIM_ALLOWANCE_ALERT_TO = ["jerry.qiu@allthingsnet.io"];

export type SimModemUsage = {
  iccid: string;
  customer: string | null;
  modemId: string | null;
  ctdUsageMb: number;
  allowanceMb: number | null;
  pct: number | null;
  status: string;
};

export async function listSimModemUsage(input?: {
  customer?: string;
  q?: string;
  minPct?: number;
  limit?: number;
}): Promise<SimModemUsage[]> {
  const customer = input?.customer?.trim() ?? "";
  const q = input?.q?.trim() ?? "";
  const minPct = input?.minPct;
  const limit = Math.min(Math.max(input?.limit ?? 500, 1), 2000);

  const rows = await getDB()
    .prepare(
      `SELECT d.iccid, d.customer, d.modem_id, d.status,
              IFNULL(d.ctd_usage_mb, 0) AS ctd_usage_mb,
              a.allowance_mb AS allowance_mb
       FROM cc_devices d
       LEFT JOIN modem_allowances a ON a.modem_id = d.modem_id
       WHERE (? = '' OR IFNULL(d.customer, '') LIKE ?)
         AND (
           ? = ''
           OR d.iccid LIKE ?
           OR IFNULL(d.modem_id, '') LIKE ?
           OR IFNULL(d.customer, '') LIKE ?
         )
       ORDER BY
         CASE WHEN a.allowance_mb IS NOT NULL AND a.allowance_mb > 0
              THEN IFNULL(d.ctd_usage_mb, 0) / a.allowance_mb
              ELSE -1 END DESC,
         d.iccid ASC
       LIMIT ?`,
    )
    .bind(customer, `%${customer}%`, q, `%${q.replace(/\s/g, "")}%`, `%${q}%`, `%${q}%`, limit)
    .all<{
      iccid: string;
      customer: string | null;
      modem_id: string | null;
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
      ctdUsageMb,
      allowanceMb,
      pct,
      status: row.status,
    };
  });

  if (minPct == null) return mapped;
  return mapped.filter((row) => row.pct != null && row.pct >= minPct);
}

type AlertCandidate = SimModemUsage & { modemId: string; allowanceMb: number; pct: number };

function withAllowance(sims: SimModemUsage[]): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const sim of sims) {
    if (!sim.modemId || sim.allowanceMb == null || sim.allowanceMb <= 0 || sim.pct == null) continue;
    out.push({
      ...sim,
      modemId: sim.modemId,
      allowanceMb: sim.allowanceMb,
      pct: sim.pct,
    });
  }
  return out;
}

function buildSimAllowanceAlertEmail(input: {
  sims: AlertCandidate[];
  day: string;
  threshold: number;
}): { subject: string; html: string } {
  const { sims, day, threshold } = input;
  const rowsHtml = sims
    .map((sim, index) => {
      const pctColor = sim.pct >= 100 ? "#b91c1c" : sim.pct >= threshold ? "#b45309" : "#047857";
      return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;">${index + 1}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#111827;">${escapeHtml(sim.iccid)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${escapeHtml(sim.customer ?? "—")}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#111827;">${escapeHtml(sim.modemId)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;">${sim.ctdUsageMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;">${sim.allowanceMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${pctColor};">${sim.pct}%</td>
      </tr>`;
    })
    .join("");

  const subject = `Catalyst: ${sims.length} SIM${sims.length === 1 ? "" : "s"} at ≥${threshold}% modem allowance`;

  const html = `
  <div style="background:#f3f4f6;padding:24px 12px;">
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#070B14;padding:20px 24px;">
        <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#2EE6D6;font-weight:700;">ATN Catalyst</p>
        <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:600;">Modem allowance alert</h1>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.5;">
          ${sims.length} SIM${sims.length === 1 ? " has" : "s have"} reached <strong>≥${threshold}%</strong> of their modem_ID allowance
          (CTD MB ÷ allowance MB) as of Sydney day <strong>${day}</strong>.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 20px;font-size:13px;">
          <thead>
            <tr style="text-align:left;background:#f9fafb;color:#6b7280;">
              <th style="padding:10px 12px;font-weight:600;">#</th>
              <th style="padding:10px 12px;font-weight:600;">ICCID</th>
              <th style="padding:10px 12px;font-weight:600;">CC customer</th>
              <th style="padding:10px 12px;font-weight:600;">modem_ID</th>
              <th style="padding:10px 12px;font-weight:600;text-align:right;">CTD MB</th>
              <th style="padding:10px 12px;font-weight:600;text-align:right;">Allowance</th>
              <th style="padding:10px 12px;font-weight:600;text-align:right;">%</th>
            </tr>
          </thead>
          <tbody>${rowsHtml || `<tr><td colspan="7" style="padding:16px;color:#6b7280;">No SIMs with a modem allowance.</td></tr>`}</tbody>
        </table>
        <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
          Open Catalyst → Usage for the full list. Each ICCID is emailed at most once per Sydney day at this threshold.
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

/**
 * Find SIMs at/above threshold that have not been emailed today; notify once.
 */
export async function notifySimAllowanceAlerts(threshold = SIM_ALLOWANCE_ALERT_PCT): Promise<{
  checked: number;
  newlyAlerted: number;
  emailed: boolean;
}> {
  const day = sydneyDayKey();
  const sims = await listSimModemUsage({ limit: 2000 });
  const candidates = withAllowance(sims).filter((sim) => sim.pct >= threshold);

  if (candidates.length === 0) {
    return { checked: sims.length, newlyAlerted: 0, emailed: false };
  }

  const db = getDB();
  const fresh: AlertCandidate[] = [];
  for (const sim of candidates) {
    const existing = await db
      .prepare(
        `SELECT 1 AS ok FROM sim_allowance_alerts
         WHERE iccid = ? AND day = ? AND threshold = ?`,
      )
      .bind(sim.iccid, day, threshold)
      .first<{ ok: number }>();
    if (!existing) fresh.push(sim);
  }

  if (fresh.length === 0) {
    return { checked: sims.length, newlyAlerted: 0, emailed: false };
  }

  const { subject, html } = buildSimAllowanceAlertEmail({
    sims: fresh.slice(0, 50),
    day,
    threshold,
  });
  const emailed = await sendAlertHtml(subject, html);

  if (emailed) {
    const now = new Date().toISOString();
    const stmts = fresh.map((sim) =>
      db
        .prepare(
          `INSERT INTO sim_allowance_alerts
             (iccid, day, threshold, pct, ctd_usage_mb, allowance_mb, modem_id, customer, emailed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(iccid, day, threshold) DO NOTHING`,
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
        ),
    );
    for (let i = 0; i < stmts.length; i += 40) {
      await db.batch(stmts.slice(i, i + 40));
    }
  }

  return { checked: sims.length, newlyAlerted: fresh.length, emailed };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
