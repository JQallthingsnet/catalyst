import { sendSystemEmail } from "@/lib/auth/email";
import { getDB } from "@/lib/env";
import { getAlertSetting, PLATFORM_ALERT_SCOPE } from "@/lib/portal/alert-settings";
import { listPoolModemLatest, listPoolRatePlanLatest } from "@/lib/portal/pools";
import { listCcCustomerBindings } from "@/lib/portal/tenant";
import { sydneyDayKey } from "@/lib/portal/time";


/** Sentinel ICCID prefixes: one row per digest kind × scope × Sydney day. */
const DIGEST_POOLS_RATE_PLAN = "__digest_pools_rp__";
const DIGEST_POOLS_MODEM_PREFIX = "__digest_pools_modem__:";
const DIGEST_USAGE_MODEM_PREFIX = "__digest_usage_modem__:";
/** Legacy marker from the old single Usage digest. */
const LEGACY_DAILY_DIGEST_MARKER = "__daily_digest__";

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

type PoolBreachRow = {
  key: string;
  label: string;
  customer: string | null;
  ctdUsageMb: number;
  allowanceMb: number;
  pct: number;
  simCount: number;
};

async function digestAlreadySent(marker: string, day: string, threshold: number): Promise<boolean> {
  const row = await getDB()
    .prepare(
      `SELECT 1 AS ok FROM sim_allowance_alerts
       WHERE iccid = ? AND day = ? AND threshold = ?`,
    )
    .bind(marker, day, threshold)
    .first<{ ok: number }>();
  return Boolean(row);
}

async function markDigestSent(marker: string, day: string, threshold: number, basis: UsageAllowanceBasis) {
  const now = new Date().toISOString();
  await getDB()
    .prepare(
      `INSERT INTO sim_allowance_alerts
         (iccid, day, threshold, pct, ctd_usage_mb, allowance_mb, modem_id, customer, emailed_at, rate_plan, basis)
       VALUES (?, ?, ?, 0, 0, 0, NULL, NULL, ?, NULL, ?)
       ON CONFLICT(iccid, day, threshold) DO UPDATE SET emailed_at = excluded.emailed_at`,
    )
    .bind(marker, day, threshold, now, basis)
    .run();
}

async function recordUsageAlerts(
  sims: AlertCandidate[],
  day: string,
  threshold: number,
  basis: UsageAllowanceBasis,
) {
  const now = new Date().toISOString();
  const db = getDB();
  const stmts = sims.map((sim) =>
    db
      .prepare(
        `INSERT INTO sim_allowance_alerts
           (iccid, day, threshold, pct, ctd_usage_mb, allowance_mb, modem_id, customer, emailed_at, rate_plan, basis)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(iccid, day, threshold) DO UPDATE SET
           pct = excluded.pct,
           ctd_usage_mb = excluded.ctd_usage_mb,
           allowance_mb = excluded.allowance_mb,
           emailed_at = excluded.emailed_at,
           rate_plan = excluded.rate_plan,
           basis = excluded.basis`,
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
  );
  for (let i = 0; i < stmts.length; i += 40) {
    await db.batch(stmts.slice(i, i + 40));
  }
}

async function sendAlertHtml(to: string[], subject: string, html: string): Promise<boolean> {
  let emailed = false;
  for (const addr of to) {
    try {
      await sendSystemEmail(addr, subject, html);
      emailed = true;
    } catch (err) {
      console.error("[sim-usage] alert email failed", addr, err);
    }
  }
  return emailed;
}

function buildPoolAlertEmail(input: {
  rows: PoolBreachRow[];
  day: string;
  threshold: number;
  kind: "rate_plan" | "modem";
  audience: "super" | "reseller";
  customer?: string;
}): { subject: string; html: string } {
  const { rows, day, threshold, kind, audience, customer } = input;
  const keyLabel = kind === "rate_plan" ? "Rate plan" : "modem_ID";
  const title = kind === "rate_plan" ? "Pools · rate plan alert" : "Pools · modem_ID alert";
  const scope =
    audience === "reseller" && customer
      ? ` for CC customer <strong>${escapeHtml(customer)}</strong>`
      : "";
  const rowsHtml = rows
    .map((row, index) => {
      const pctColor = row.pct >= 100 ? "#b91c1c" : row.pct >= threshold ? "#b45309" : "#047857";
      return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;">${index + 1}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${escapeHtml(row.label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${escapeHtml(row.customer ?? "—")}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;">${row.simCount.toLocaleString("en-AU")}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;">${row.ctdUsageMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;">${row.allowanceMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${pctColor};">${row.pct}%</td>
      </tr>`;
    })
    .join("");

  const subject = `Catalyst daily Pools: ${rows.length} ${
    kind === "rate_plan" ? "rate plan" : "modem_ID"
  }${rows.length === 1 ? "" : "s"} ≥${threshold}% (${day})`;

  const html = `
  <div style="background:#f3f4f6;padding:24px 12px;">
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#070B14;padding:20px 24px;">
        <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#2EE6D6;font-weight:700;">ATN Catalyst</p>
        <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:600;">${title}</h1>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.5;">
          Daily Pools digest for Sydney day <strong>${day}</strong>${scope}:
          ${rows.length} ${keyLabel}${rows.length === 1 ? "" : "s"} at <strong>≥${threshold}%</strong>
          of mapped allowance (Σ CTD MB ÷ Σ allowance MB).
        </p>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 20px;font-size:13px;">
          <thead>
            <tr style="text-align:left;background:#f9fafb;color:#6b7280;">
              <th style="padding:10px 12px;font-weight:600;">#</th>
              <th style="padding:10px 12px;font-weight:600;">${keyLabel}</th>
              <th style="padding:10px 12px;font-weight:600;">CC customer</th>
              <th style="padding:10px 12px;font-weight:600;text-align:right;">SIMs</th>
              <th style="padding:10px 12px;font-weight:600;text-align:right;">CTD MB</th>
              <th style="padding:10px 12px;font-weight:600;text-align:right;">Allowance</th>
              <th style="padding:10px 12px;font-weight:600;text-align:right;">%</th>
            </tr>
          </thead>
          <tbody>${rowsHtml || `<tr><td colspan="7" style="padding:16px;color:#6b7280;">No pools with an allowance.</td></tr>`}</tbody>
        </table>
        <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
          Open Catalyst → Pools for the live chart
          ${rows.length > 50 ? ` (email shows top 50 of ${rows.length}).` : "."}
        </p>
      </div>
    </div>
  </div>`;

  return { subject, html };
}

function buildSimAllowanceAlertEmail(input: {
  sims: AlertCandidate[];
  day: string;
  threshold: number;
  basis: UsageAllowanceBasis;
  customer?: string;
}): { subject: string; html: string } {
  const { sims, day, threshold, basis, customer } = input;
  const keyLabel = basis === "rate_plan" ? "Rate plan" : "modem_ID";
  const title =
    basis === "rate_plan" ? "Usage · rate plan allowance alert" : "Usage · modem allowance alert";
  const scope = customer ? ` for CC customer <strong>${escapeHtml(customer)}</strong>` : "";
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

  const subject = `Catalyst daily Usage: ${sims.length} SIM${sims.length === 1 ? "" : "s"} ≥${threshold}% ${
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
          Daily Usage digest for Sydney day <strong>${day}</strong>${scope}:
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
          Open Catalyst → Usage for the live list
          ${sims.length > 50 ? ` (email shows top 50 of ${sims.length}).` : "."}
        </p>
      </div>
    </div>
  </div>`;

  return { subject, html };
}

/** SIMs at ≥threshold% of modem_ID allowance, optionally scoped to one CC customer. */
async function listModemBreachCandidates(
  threshold: number,
  customer: string,
): Promise<AlertCandidate[]> {
  const ratio = threshold / 100;
  const exact = customer.trim();
  const rows = await getDB()
    .prepare(
      `SELECT d.iccid, d.customer, d.modem_id, d.rate_plan, d.status,
              IFNULL(d.ctd_usage_mb, 0) AS ctd_usage_mb,
              a.allowance_mb AS allowance_mb
       FROM cc_devices d
       INNER JOIN modem_allowances a ON a.modem_id = d.modem_id
       WHERE a.allowance_mb > 0
         AND IFNULL(d.ctd_usage_mb, 0) / a.allowance_mb >= ?
         AND d.modem_id IS NOT NULL AND TRIM(d.modem_id) != ''
         AND (? = '' OR IFNULL(d.customer, '') = ?)
       ORDER BY IFNULL(d.ctd_usage_mb, 0) / a.allowance_mb DESC, d.iccid ASC
       LIMIT 500`,
    )
    .bind(ratio, exact, exact)
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
      basis: "modem" as const,
    };
  });
}

type DigestAttempt = {
  checked: number;
  newlyAlerted: number;
  emailed: boolean;
  skipReason?: string;
  error?: string;
};

async function sendPoolsRatePlanDigest(input: {
  day: string;
  threshold: number;
  force: boolean;
  recipients: string[];
}): Promise<DigestAttempt> {
  const marker = DIGEST_POOLS_RATE_PLAN;
  if (!input.force && (await digestAlreadySent(marker, input.day, input.threshold))) {
    return { checked: 0, newlyAlerted: 0, emailed: false, skipReason: "already_sent_today" };
  }
  if (input.recipients.length === 0) {
    return { checked: 0, newlyAlerted: 0, emailed: false, skipReason: "no_recipients" };
  }

  const breaches = (await listPoolRatePlanLatest())
    .filter((row) => row.allowanceMb > 0 && row.pct >= input.threshold)
    .sort((a, b) => b.pct - a.pct)
    .map(
      (row): PoolBreachRow => ({
        key: row.ratePlan,
        label: row.ratePlan,
        customer: null,
        ctdUsageMb: row.ctdUsageMb,
        allowanceMb: row.allowanceMb,
        pct: row.pct,
        simCount: row.simCount,
      }),
    );

  if (breaches.length === 0) {
    return { checked: 0, newlyAlerted: 0, emailed: false, skipReason: "no_breaches" };
  }

  const { subject, html } = buildPoolAlertEmail({
    rows: breaches.slice(0, 50),
    day: input.day,
    threshold: input.threshold,
    kind: "rate_plan",
    audience: "super",
  });

  const emailed = await sendAlertHtml(input.recipients, subject, html);
  if (!emailed) {
    return {
      checked: breaches.length,
      newlyAlerted: breaches.length,
      emailed: false,
      error: "SMTP send failed for super-admin pools digest.",
    };
  }

  await markDigestSent(marker, input.day, input.threshold, "rate_plan");
  console.log(
    `[sim-usage] pools rate-plan digest emailed: ${breaches.length} ≥${input.threshold}% → ${input.recipients.join(",")}`,
  );
  return { checked: breaches.length, newlyAlerted: breaches.length, emailed: true };
}

async function sendPoolsModemDigest(input: {
  day: string;
  threshold: number;
  force: boolean;
  tenantId: string;
  customer: string;
  recipients: string[];
}): Promise<DigestAttempt> {
  const marker = `${DIGEST_POOLS_MODEM_PREFIX}${input.tenantId}`;
  if (!input.force && (await digestAlreadySent(marker, input.day, input.threshold))) {
    return { checked: 0, newlyAlerted: 0, emailed: false, skipReason: "already_sent_today" };
  }
  if (input.recipients.length === 0) {
    return { checked: 0, newlyAlerted: 0, emailed: false, skipReason: "no_recipients" };
  }

  const breaches = (await listPoolModemLatest({ exactCustomer: input.customer }))
    .filter((row) => row.allowanceMb > 0 && row.pct >= input.threshold)
    .sort((a, b) => b.pct - a.pct)
    .map(
      (row): PoolBreachRow => ({
        key: row.modemId,
        label: row.modemId,
        customer: row.customer,
        ctdUsageMb: row.ctdUsageMb,
        allowanceMb: row.allowanceMb,
        pct: row.pct,
        simCount: row.simCount,
      }),
    );

  if (breaches.length === 0) {
    return { checked: 0, newlyAlerted: 0, emailed: false, skipReason: "no_breaches" };
  }

  const { subject, html } = buildPoolAlertEmail({
    rows: breaches.slice(0, 50),
    day: input.day,
    threshold: input.threshold,
    kind: "modem",
    audience: "reseller",
    customer: input.customer,
  });

  const emailed = await sendAlertHtml(input.recipients, subject, html);
  if (!emailed) {
    return {
      checked: breaches.length,
      newlyAlerted: breaches.length,
      emailed: false,
      error: `SMTP send failed for pools modem digest (${input.customer}).`,
    };
  }

  await markDigestSent(marker, input.day, input.threshold, "modem");
  console.log(
    `[sim-usage] pools modem digest emailed: ${breaches.length} ≥${input.threshold}% → ${input.recipients.join(",")} (${input.customer})`,
  );
  return { checked: breaches.length, newlyAlerted: breaches.length, emailed: true };
}

async function sendUsageModemDigest(input: {
  day: string;
  threshold: number;
  force: boolean;
  tenantId: string;
  customer: string;
  recipients: string[];
}): Promise<DigestAttempt> {
  const marker = `${DIGEST_USAGE_MODEM_PREFIX}${input.tenantId}`;
  if (!input.force && (await digestAlreadySent(marker, input.day, input.threshold))) {
    return { checked: 0, newlyAlerted: 0, emailed: false, skipReason: "already_sent_today" };
  }
  if (input.recipients.length === 0) {
    return { checked: 0, newlyAlerted: 0, emailed: false, skipReason: "no_recipients" };
  }

  const candidates = await listModemBreachCandidates(input.threshold, input.customer);
  if (candidates.length === 0) {
    return { checked: 0, newlyAlerted: 0, emailed: false, skipReason: "no_breaches" };
  }

  const { subject, html } = buildSimAllowanceAlertEmail({
    sims: candidates.slice(0, 50),
    day: input.day,
    threshold: input.threshold,
    basis: "modem",
    customer: input.customer,
  });

  const emailed = await sendAlertHtml(input.recipients, subject, html);
  if (!emailed) {
    return {
      checked: candidates.length,
      newlyAlerted: candidates.length,
      emailed: false,
      error: `SMTP send failed for usage modem digest (${input.customer}).`,
    };
  }

  await markDigestSent(marker, input.day, input.threshold, "modem");
  await recordUsageAlerts(candidates, input.day, input.threshold, "modem");
  console.log(
    `[sim-usage] usage modem digest emailed: ${candidates.length} SIMs ≥${input.threshold}% → ${input.recipients.join(",")} (${input.customer})`,
  );
  return { checked: candidates.length, newlyAlerted: candidates.length, emailed: true };
}

/**
 * Daily digests (once per Sydney day unless force), using Alerts settings:
 * - Super admin → Pools by rate plan (platform pool recipients + threshold)
 * - Each bound reseller → Pools by modem_ID + Usage per SIM (tenant pool/usage settings)
 */
export async function notifySimAllowanceAlerts(opts?: { force?: boolean }): Promise<{
  checked: number;
  newlyAlerted: number;
  emailed: boolean;
  day: string;
  skipReason?: string;
  error?: string;
}> {
  const day = sydneyDayKey();
  const force = opts?.force === true;
  const db = getDB();

  if (force) {
    await db
      .prepare(
        `DELETE FROM sim_allowance_alerts
         WHERE day = ?
           AND (
             iccid = ?
             OR iccid = ?
             OR iccid LIKE ?
             OR iccid LIKE ?
           )`,
      )
      .bind(
        day,
        LEGACY_DAILY_DIGEST_MARKER,
        DIGEST_POOLS_RATE_PLAN,
        `${DIGEST_POOLS_MODEM_PREFIX}%`,
        `${DIGEST_USAGE_MODEM_PREFIX}%`,
      )
      .run();
  }

  let checked = 0;
  let newlyAlerted = 0;
  let emailed = false;
  const errors: string[] = [];
  const skipReasons = new Set<string>();

  const fold = (result: DigestAttempt) => {
    checked += result.checked;
    newlyAlerted += result.newlyAlerted;
    if (result.emailed) emailed = true;
    if (result.error) errors.push(result.error);
    if (result.skipReason) skipReasons.add(result.skipReason);
  };

  const platformPool = await getAlertSetting(PLATFORM_ALERT_SCOPE, "pool");
  if (platformPool.thresholdPct != null && platformPool.recipients.length > 0) {
    fold(
      await sendPoolsRatePlanDigest({
        day,
        threshold: platformPool.thresholdPct,
        force,
        recipients: platformPool.recipients,
      }),
    );
  } else {
    skipReasons.add("no_recipients");
  }

  const bindings = await listCcCustomerBindings();
  for (const binding of bindings) {
    const [poolSettings, usageSettings] = await Promise.all([
      getAlertSetting(binding.tenantId, "pool"),
      getAlertSetting(binding.tenantId, "usage"),
    ]);
    if (poolSettings.thresholdPct != null && poolSettings.recipients.length > 0) {
      fold(
        await sendPoolsModemDigest({
          day,
          threshold: poolSettings.thresholdPct,
          force,
          tenantId: binding.tenantId,
          customer: binding.ccCustomer,
          recipients: poolSettings.recipients,
        }),
      );
    } else {
      skipReasons.add("no_recipients");
    }
    if (usageSettings.thresholdPct != null && usageSettings.recipients.length > 0) {
      fold(
        await sendUsageModemDigest({
          day,
          threshold: usageSettings.thresholdPct,
          force,
          tenantId: binding.tenantId,
          customer: binding.ccCustomer,
          recipients: usageSettings.recipients,
        }),
      );
    } else {
      skipReasons.add("no_recipients");
    }
  }

  if (emailed) {
    return { checked, newlyAlerted, emailed: true, day, error: errors[0] };
  }

  if (errors.length > 0) {
    return { checked, newlyAlerted, emailed: false, day, error: errors.join(" · ") };
  }

  const skipReason =
    skipReasons.has("already_sent_today") && skipReasons.size === 1
      ? "already_sent_today"
      : skipReasons.has("no_breaches") && !skipReasons.has("already_sent_today")
        ? "no_breaches"
        : skipReasons.size > 0
          ? [...skipReasons].join(",")
          : "no_breaches";

  return { checked, newlyAlerted, emailed: false, day, skipReason };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
