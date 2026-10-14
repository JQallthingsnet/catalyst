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

/**
 * Find SIMs at/above threshold that have not been emailed today; notify all super admins once.
 */
export async function notifySimAllowanceAlerts(threshold = SIM_ALLOWANCE_ALERT_PCT): Promise<{
  checked: number;
  newlyAlerted: number;
  emailed: boolean;
}> {
  const day = sydneyDayKey();
  const sims = await listSimModemUsage({ limit: 2000 });
  const candidates: AlertCandidate[] = [];
  for (const sim of sims) {
    if (!sim.modemId || sim.allowanceMb == null || sim.allowanceMb <= 0 || sim.pct == null) continue;
    if (sim.pct < threshold) continue;
    candidates.push({
      ...sim,
      modemId: sim.modemId,
      allowanceMb: sim.allowanceMb,
      pct: sim.pct,
    });
  }

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

  const emails = SIM_ALLOWANCE_ALERT_TO;
  if (emails.length === 0) {
    return { checked: sims.length, newlyAlerted: fresh.length, emailed: false };
  }

  const rowsHtml = fresh
    .slice(0, 50)
    .map(
      (sim) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:12px;">${escapeHtml(sim.iccid)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(sim.customer ?? "—")}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(sim.modemId)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${sim.ctdUsageMb.toFixed(1)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${sim.allowanceMb.toFixed(1)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#b45309;">${sim.pct}%</td>
      </tr>`,
    )
    .join("");

  const subject = `Catalyst: ${fresh.length} SIM${fresh.length === 1 ? "" : "s"} at ≥${threshold}% modem allowance`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;">
      <h2 style="color:#111827;">Modem allowance alert</h2>
      <p>${fresh.length} SIM${fresh.length === 1 ? " has" : "s have"} reached <strong>≥${threshold}%</strong> of their modem_ID allowance (CTD MB ÷ allowance MB) as of Sydney day <strong>${day}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:13px;">
        <thead>
          <tr style="text-align:left;color:#6b7280;">
            <th style="padding:6px 10px;">ICCID</th>
            <th style="padding:6px 10px;">CC customer</th>
            <th style="padding:6px 10px;">modem_ID</th>
            <th style="padding:6px 10px;text-align:right;">CTD MB</th>
            <th style="padding:6px 10px;text-align:right;">Allowance</th>
            <th style="padding:6px 10px;text-align:right;">%</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${fresh.length > 50 ? `<p style="color:#6b7280;font-size:13px;">Showing first 50 of ${fresh.length}.</p>` : ""}
      <p style="color:#6b7280;font-size:13px;">Open Catalyst → Usage for the full list. Each ICCID is emailed at most once per Sydney day at this threshold.</p>
    </div>
  `;

  let emailed = false;
  for (const to of emails) {
    try {
      await sendSystemEmail(to, subject, html);
      emailed = true;
    } catch (err) {
      console.error("[sim-usage] alert email failed", to, err);
    }
  }

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
