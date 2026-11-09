import { getDB } from "@/lib/env";
import { portalTableHasColumn } from "@/lib/portal/d1-compat";
import { pickBilledPlatformPlanId } from "@/lib/portal/sim-platform-plan-daily";
import {
  listPoolModemTopups,
  sumPoolTopupMbByModem,
  sumPoolTopupUnitsByModem,
  sydneyMonthKey,
} from "@/lib/portal/pool-topups";
import { sydneyDayKey, sydneyYmd } from "@/lib/portal/time";

export type InvoiceIccidRow = {
  organisationName: string;
  tenantId: string;
  iccid: string;
  /** Billed Reseller Plan for the month (highest unit price among plans used). */
  resellerPlan: string;
  /** Monthly Charge = contract unit price for that plan. */
  chargeAud: number;
};

export type InvoicePlanSummary = {
  organisationName: string;
  tenantId: string;
  resellerPlan: string;
  simCount: number;
  ctdUsageMb: number;
  ctdSms: number;
  ctdVoiceMin: number;
  allowanceMb: number;
  poolUtilisationPct: number;
  excessDataMb: number;
  excessSms: number;
  excessVoiceMin: number;
  topupCount: number;
  topupSimUnits: number;
  unitPriceAud: number;
};

export type MonthlyInvoice = {
  monthKey: string;
  /** Inclusive Sydney days used for the cycle window. */
  dateFrom: string;
  dateTo: string;
  /** As-of day for CTD / pool snapshot (end of cycle or today if month in progress). */
  asOfDay: string;
  organisationName: string | null;
  iccidRows: InvoiceIccidRow[];
  planSummaries: InvoicePlanSummary[];
  topups: Awaited<ReturnType<typeof listPoolModemTopups>>;
};

/** YYYY-MM → first/last Sydney day keys, and as-of day (not past today). */
export function invoiceMonthWindow(monthKey: string): {
  monthKey: string;
  dateFrom: string;
  dateTo: string;
  asOfDay: string;
} {
  const key = /^\d{4}-\d{2}$/.test(monthKey.trim()) ? monthKey.trim() : sydneyMonthKey();
  const [ys, ms] = key.split("-");
  const year = Number(ys);
  const month = Number(ms);
  const dateFrom = `${ys}-${ms}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const last = new Date(Date.UTC(nextYear, nextMonth - 1, 0));
  const dateTo = `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, "0")}-${String(last.getUTCDate()).padStart(2, "0")}`;
  const today = sydneyDayKey();
  const asOfDay = today < dateFrom ? dateFrom : today > dateTo ? dateTo : today;
  return { monthKey: key, dateFrom, dateTo, asOfDay };
}

export function previousSydneyMonthKey(at: Date = new Date()): string {
  const { year, month } = sydneyYmd(at);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
}

async function countTopupsByModem(tenantId: string, monthKey: string): Promise<Map<string, number>> {
  try {
    const rows = await getDB()
      .prepare(
        `SELECT modem_id, COUNT(*) AS n
         FROM pool_modem_topups
         WHERE tenant_id = ? AND month_key = ?
         GROUP BY modem_id`,
      )
      .bind(tenantId, monthKey)
      .all<{ modem_id: string; n: number }>();
    return new Map((rows.results ?? []).map((row) => [row.modem_id, row.n ?? 0]));
  } catch {
    return new Map();
  }
}

type PlanPool = {
  ctdUsageMb: number;
  ctdSms: number;
  ctdVoiceMin: number;
  allowanceMb: number;
  simCount: number;
  perSimMb: number;
  perSimSms: number | null;
  perSimVoice: number | null;
};

async function loadPlanPools(input: {
  tenantId: string;
  monthKey: string;
  asOfDay: string;
}): Promise<Map<string, PlanPool>> {
  const db = getDB();
  const hasSms = await portalTableHasColumn("modem_allowances", "allowance_sms");
  const hasVoice = await portalTableHasColumn("modem_allowances", "allowance_voice_min");
  const smsExpr = hasSms ? "a.allowance_sms" : "NULL";
  const voiceExpr = hasVoice ? "a.allowance_voice_min" : "NULL";

  // Prefer same-day pool snapshot; fall back to live SIMs × CTD.
  const snap = await db
    .prepare(
      `SELECT modem_id, ctd_usage_mb, IFNULL(ctd_sms, 0) AS ctd_sms,
              IFNULL(ctd_voice_min, 0) AS ctd_voice_min, allowance_mb, sim_count
       FROM pool_modem_daily
       WHERE day = ? AND customer IN (
         SELECT cc_customer FROM tenants WHERE id = ? AND IFNULL(TRIM(cc_customer), '') != ''
       )`,
    )
    .bind(input.asOfDay, input.tenantId)
    .all<{
      modem_id: string;
      ctd_usage_mb: number;
      ctd_sms: number;
      ctd_voice_min: number;
      allowance_mb: number;
      sim_count: number;
    }>();

  const live = await db
    .prepare(
      `SELECT TRIM(pp.name) AS modem_id,
              COUNT(*) AS sim_count,
              IFNULL(SUM(IFNULL(d.ctd_usage_mb, 0)), 0) AS ctd_usage_mb,
              IFNULL(SUM(IFNULL(d.ctd_sms, 0)), 0) AS ctd_sms,
              IFNULL(SUM(IFNULL(d.ctd_voice_min, 0)), 0) AS ctd_voice_min,
              a.allowance_mb AS per_sim_mb,
              ${smsExpr} AS per_sim_sms,
              ${voiceExpr} AS per_sim_voice
       FROM sims s
       JOIN platform_plans pp ON pp.id = s.platform_plan_id
       LEFT JOIN cc_devices d ON d.iccid = s.iccid
       LEFT JOIN modem_allowances a ON a.modem_id = TRIM(pp.name)
       WHERE s.tenant_id = ?
         AND s.platform_plan_id IS NOT NULL AND TRIM(s.platform_plan_id) != ''
         AND TRIM(IFNULL(pp.name, '')) != ''
       GROUP BY TRIM(pp.name)`,
    )
    .bind(input.tenantId)
    .all<{
      modem_id: string;
      sim_count: number;
      ctd_usage_mb: number;
      ctd_sms: number;
      ctd_voice_min: number;
      per_sim_mb: number | null;
      per_sim_sms: number | null;
      per_sim_voice: number | null;
    }>();

  const topupMb = await sumPoolTopupMbByModem({
    tenantId: input.tenantId,
    monthKey: input.monthKey,
  });
  const byPlan = new Map<string, PlanPool>();

  for (const row of live.results ?? []) {
    const perSimMb = row.per_sim_mb ?? 0;
    const base = perSimMb * (row.sim_count || 0);
    const allowanceMb = base + (topupMb.get(row.modem_id) ?? 0);
    byPlan.set(row.modem_id, {
      ctdUsageMb: row.ctd_usage_mb ?? 0,
      ctdSms: row.ctd_sms ?? 0,
      ctdVoiceMin: row.ctd_voice_min ?? 0,
      allowanceMb,
      simCount: row.sim_count ?? 0,
      perSimMb,
      perSimSms: row.per_sim_sms,
      perSimVoice: row.per_sim_voice,
    });
  }

  // Overlay snapshot CTD/sim counts when available (closed days); keep live allowance + top-ups.
  for (const row of snap.results ?? []) {
    const existing = byPlan.get(row.modem_id);
    if (!existing) {
      byPlan.set(row.modem_id, {
        ctdUsageMb: row.ctd_usage_mb ?? 0,
        ctdSms: row.ctd_sms ?? 0,
        ctdVoiceMin: row.ctd_voice_min ?? 0,
        allowanceMb: (row.allowance_mb ?? 0) + (topupMb.get(row.modem_id) ?? 0),
        simCount: row.sim_count ?? 0,
        perSimMb: 0,
        perSimSms: null,
        perSimVoice: null,
      });
      continue;
    }
    existing.ctdUsageMb = row.ctd_usage_mb ?? existing.ctdUsageMb;
    existing.ctdSms = row.ctd_sms ?? existing.ctdSms;
    existing.ctdVoiceMin = row.ctd_voice_min ?? existing.ctdVoiceMin;
    existing.simCount = row.sim_count ?? existing.simCount;
  }

  return byPlan;
}

/**
 * Monthly invoice for one reseller org (Sydney calendar month).
 * Charge = unit price of the Reseller Plan billed for that ICCID in the month.
 * Cycle uses as-of day (month end, or today while the month is open) after the 11:59pm Sydney refresh window.
 */
export async function buildMonthlyInvoice(input: {
  tenantId: string;
  monthKey?: string;
  organisationName?: string | null;
}): Promise<MonthlyInvoice> {
  const tenantId = input.tenantId.trim();
  const window = invoiceMonthWindow(input.monthKey ?? sydneyMonthKey());
  const db = getDB();

  const tenant = await db
    .prepare(`SELECT id, name FROM tenants WHERE id = ?`)
    .bind(tenantId)
    .first<{ id: string; name: string }>();
  const organisationName = input.organisationName?.trim() || tenant?.name || tenantId;

  const hasUnitPrice = await portalTableHasColumn("tenant_plan_assignments", "unit_price_aud");
  const priceExpr = hasUnitPrice ? "IFNULL(a.unit_price_aud, 0)" : "0";
  const priceRows = await db
    .prepare(
      `SELECT p.id AS platform_plan_id, TRIM(p.name) AS modem_id,
              ${priceExpr} AS unit_price_aud, IFNULL(a.is_default, 0) AS is_default
       FROM tenant_plan_assignments a
       JOIN platform_plans p ON p.id = a.platform_plan_id
       WHERE a.tenant_id = ? AND TRIM(IFNULL(p.name, '')) != ''`,
    )
    .bind(tenantId)
    .all<{
      platform_plan_id: string;
      modem_id: string;
      unit_price_aud: number;
      is_default: number;
    }>();
  const priceByPlanId = new Map<
    string,
    { modemId: string; unitPriceAud: number; isDefault: boolean }
  >();
  const priceByModem = new Map<string, number>();
  for (const row of priceRows.results ?? []) {
    priceByPlanId.set(row.platform_plan_id, {
      modemId: row.modem_id,
      unitPriceAud: Number(row.unit_price_aud) || 0,
      isDefault: Boolean(row.is_default),
    });
    priceByModem.set(row.modem_id, Number(row.unit_price_aud) || 0);
  }

  const daily = await db
    .prepare(
      `SELECT iccid, day, platform_plan_id, plan_name
       FROM sim_platform_plan_daily
       WHERE tenant_id = ? AND day >= ? AND day <= ?
       ORDER BY iccid ASC, day ASC`,
    )
    .bind(tenantId, window.dateFrom, window.asOfDay)
    .all<{
      iccid: string;
      day: string;
      platform_plan_id: string;
      plan_name: string;
    }>();

  // ICCID → plans seen in month (for billed pick).
  const plansByIccidDay = new Map<string, Map<string, Array<{
    platformPlanId: string;
    planName: string;
    unitPriceAud: number;
    isDefault: boolean;
  }>>>();
  for (const row of daily.results ?? []) {
    const dayMap = plansByIccidDay.get(row.iccid) ?? new Map();
    const price = priceByPlanId.get(row.platform_plan_id);
    const list = dayMap.get(row.day) ?? [];
    list.push({
      platformPlanId: row.platform_plan_id,
      planName: row.plan_name,
      unitPriceAud: price?.unitPriceAud ?? 0,
      isDefault: price?.isDefault ?? false,
    });
    dayMap.set(row.day, list);
    plansByIccidDay.set(row.iccid, dayMap);
  }

  const simRows = await db
    .prepare(
      `SELECT s.iccid, TRIM(pp.name) AS modem_id, s.platform_plan_id
       FROM sims s
       LEFT JOIN platform_plans pp ON pp.id = s.platform_plan_id
       WHERE s.tenant_id = ?
         AND s.platform_plan_id IS NOT NULL AND TRIM(s.platform_plan_id) != ''`,
    )
    .bind(tenantId)
    .all<{ iccid: string; modem_id: string | null; platform_plan_id: string }>();

  const iccidSet = new Set<string>();
  for (const row of simRows.results ?? []) iccidSet.add(row.iccid);
  for (const iccid of plansByIccidDay.keys()) iccidSet.add(iccid);

  const currentPlanByIccid = new Map<string, { modemId: string; platformPlanId: string }>();
  for (const row of simRows.results ?? []) {
    if (row.modem_id) {
      currentPlanByIccid.set(row.iccid, {
        modemId: row.modem_id,
        platformPlanId: row.platform_plan_id,
      });
    }
  }

  const planPools = await loadPlanPools({
    tenantId,
    monthKey: window.monthKey,
    asOfDay: window.asOfDay,
  });
  const topupUnits = await sumPoolTopupUnitsByModem({
    tenantId,
    monthKey: window.monthKey,
  });
  const topupCounts = await countTopupsByModem(tenantId, window.monthKey);
  const topups = await listPoolModemTopups({
    tenantId,
    monthKey: window.monthKey,
    limit: 2000,
  });

  function planMetrics(modemId: string) {
    const pool = planPools.get(modemId);
    const ctd = pool?.ctdUsageMb ?? 0;
    const allow = pool?.allowanceMb ?? 0;
    const smsAllow =
      pool?.perSimSms != null && pool.perSimSms > 0
        ? pool.perSimSms * (pool.simCount || 0)
        : pool?.perSimSms === 0
          ? 0
          : null;
    const voiceAllow =
      pool?.perSimVoice != null && pool.perSimVoice > 0
        ? pool.perSimVoice * (pool.simCount || 0)
        : pool?.perSimVoice === 0
          ? 0
          : null;
    const util = allow > 0 ? Math.round((ctd / allow) * 100) : 0;
    return {
      pool,
      util,
      excessDataMb: Math.max(0, ctd - allow),
      excessSms: smsAllow == null ? 0 : Math.max(0, (pool?.ctdSms ?? 0) - smsAllow),
      excessVoiceMin: voiceAllow == null ? 0 : Math.max(0, (pool?.ctdVoiceMin ?? 0) - voiceAllow),
      topupCount: topupCounts.get(modemId) ?? 0,
      topupSimUnits: topupUnits.get(modemId) ?? 0,
    };
  }

  const iccidRows: InvoiceIccidRow[] = [];
  for (const iccid of [...iccidSet].sort()) {
    const dayMap = plansByIccidDay.get(iccid);
    // Collect unique plans that were billed on any day; then pick highest unit price overall.
    const billedCandidates: Array<{
      platformPlanId: string;
      planName: string;
      unitPriceAud: number;
      isDefault: boolean;
    }> = [];
    if (dayMap) {
      for (const plans of dayMap.values()) {
        const billedId = pickBilledPlatformPlanId(plans);
        const billed = plans.find((plan) => plan.platformPlanId === billedId);
        if (billed) billedCandidates.push(billed);
      }
    }
    let resellerPlan = "";
    let chargeAud = 0;
    if (billedCandidates.length > 0) {
      const unique = new Map<string, (typeof billedCandidates)[0]>();
      for (const plan of billedCandidates) unique.set(plan.platformPlanId, plan);
      const winnerId = pickBilledPlatformPlanId([...unique.values()]);
      const winner = [...unique.values()].find((plan) => plan.platformPlanId === winnerId);
      resellerPlan = winner?.planName?.trim() || "";
      chargeAud = winner?.unitPriceAud ?? 0;
    } else {
      const current = currentPlanByIccid.get(iccid);
      resellerPlan = current?.modemId ?? "";
      chargeAud = resellerPlan ? (priceByModem.get(resellerPlan) ?? 0) : 0;
    }
    if (!resellerPlan) continue;
    iccidRows.push({
      organisationName,
      tenantId,
      iccid,
      resellerPlan,
      chargeAud,
    });
  }

  const planSummaries: InvoicePlanSummary[] = [...planPools.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([modemId, pool]) => {
      const metrics = planMetrics(modemId);
      return {
        organisationName,
        tenantId,
        resellerPlan: modemId,
        simCount: pool.simCount,
        ctdUsageMb: pool.ctdUsageMb,
        ctdSms: pool.ctdSms,
        ctdVoiceMin: pool.ctdVoiceMin,
        allowanceMb: pool.allowanceMb,
        poolUtilisationPct: metrics.util,
        excessDataMb: metrics.excessDataMb,
        excessSms: metrics.excessSms,
        excessVoiceMin: metrics.excessVoiceMin,
        topupCount: metrics.topupCount,
        topupSimUnits: metrics.topupSimUnits,
        unitPriceAud: priceByModem.get(modemId) ?? 0,
      };
    });

  return {
    monthKey: window.monthKey,
    dateFrom: window.dateFrom,
    dateTo: window.dateTo,
    asOfDay: window.asOfDay,
    organisationName,
    iccidRows,
    planSummaries,
    topups,
  };
}

function xmlEscape(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sheetXml(name: string, rows: Array<Array<string | number>>): string {
  const safeName = name.replace(/[\\/*?:\[\]]/g, " ").slice(0, 31) || "Sheet";
  const body = rows
    .map((row) => {
      const cells = row
        .map((cell) => {
          if (typeof cell === "number" && Number.isFinite(cell)) {
            return `<Cell><Data ss:Type="Number">${cell}</Data></Cell>`;
          }
          return `<Cell><Data ss:Type="String">${xmlEscape(cell)}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");
  return `<Worksheet ss:Name="${xmlEscape(safeName)}"><Table>${body}</Table></Worksheet>`;
}

/** Excel-compatible SpreadsheetML (.xls) for one or more org invoices. */
export function exportInvoicesSpreadsheetXml(invoices: MonthlyInvoice[]): string {
  const iccidHeader = [
    "organisation",
    "month",
    "as_of_day",
    "iccid",
    "reseller_plan_actual",
    "charge_aud",
  ];
  const planHeader = [
    "organisation",
    "month",
    "as_of_day",
    "reseller_plan",
    "sim_count",
    "ctd_mb",
    "ctd_sms",
    "ctd_voice_min",
    "allowance_mb",
    "pool_utilisation_pct",
    "excess_data_mb",
    "excess_sms",
    "excess_voice_min",
    "topups_count",
    "topup_sim_units",
    "unit_price_aud",
  ];
  const topupHeader = [
    "organisation",
    "month",
    "when",
    "reseller_plan",
    "sim_units",
    "unit_price_aud",
    "per_sim_mb",
    "allowance_mb",
    "charge_aud",
    "by",
  ];

  const iccidRows: Array<Array<string | number>> = [iccidHeader];
  const planRows: Array<Array<string | number>> = [planHeader];
  const topupRows: Array<Array<string | number>> = [topupHeader];

  for (const invoice of invoices) {
    const org = invoice.organisationName ?? "";
    for (const row of invoice.iccidRows) {
      iccidRows.push([
        org,
        invoice.monthKey,
        invoice.asOfDay,
        row.iccid,
        row.resellerPlan,
        row.chargeAud,
      ]);
    }
    for (const row of invoice.planSummaries) {
      planRows.push([
        org,
        invoice.monthKey,
        invoice.asOfDay,
        row.resellerPlan,
        row.simCount,
        row.ctdUsageMb,
        row.ctdSms,
        row.ctdVoiceMin,
        row.allowanceMb,
        row.poolUtilisationPct,
        row.excessDataMb,
        row.excessSms,
        row.excessVoiceMin,
        row.topupCount,
        row.topupSimUnits,
        row.unitPriceAud,
      ]);
    }
    for (const row of invoice.topups) {
      topupRows.push([
        org,
        invoice.monthKey,
        row.createdAt,
        row.modemId,
        row.simUnits,
        row.unitPriceAud,
        row.perSimAllowanceMb,
        row.allowanceMb,
        row.chargeAud,
        row.createdBy,
      ]);
    }
  }

  const legendRows: Array<Array<string | number>> = [
    ["sheet", "column", "meaning"],
    [
      "ICCID charges",
      "(tab)",
      "One row per SIM with a Reseller Plan in the Sydney billing month. Per-SIM charge only — pool KPIs are on Plan pools.",
    ],
    ["ICCID charges", "organisation", "Reseller organisation name."],
    ["ICCID charges", "month", "Sydney billing month (YYYY-MM)."],
    [
      "ICCID charges",
      "as_of_day",
      "Sydney calendar day the cycle figures are taken as of (month end, or today while the month is still open), after the 11:59 pm Sydney refresh.",
    ],
    ["ICCID charges", "iccid", "SIM ICCID."],
    [
      "ICCID charges",
      "reseller_plan_actual",
      "Reseller Plan billed for that ICCID in the month — if the SIM used more than one plan, the highest contract unit-price plan wins.",
    ],
    [
      "ICCID charges",
      "charge_aud",
      "Monthly Charge in AUD = contract unit price for reseller_plan_actual (not including pool top-ups).",
    ],
    [
      "Plan pools",
      "(tab)",
      "One row per Reseller Plan pool for the organisation/month. Shared CTD, allowance, utilisation, excess, and top-up totals.",
    ],
    ["Plan pools", "organisation", "Reseller organisation name."],
    ["Plan pools", "month", "Sydney billing month (YYYY-MM)."],
    [
      "Plan pools",
      "as_of_day",
      "Same as ICCID charges — Sydney day the pool snapshot / CTD is taken as of.",
    ],
    ["Plan pools", "reseller_plan", "Catalyst Reseller Plan name (pool key)."],
    ["Plan pools", "sim_count", "Number of SIMs currently counted in that Reseller Plan pool."],
    ["Plan pools", "ctd_mb", "Cycle-to-date data usage for the pool (MB), summed across SIMs on that plan."],
    ["Plan pools", "ctd_sms", "Cycle-to-date SMS count for the pool (MO+MT)."],
    ["Plan pools", "ctd_voice_min", "Cycle-to-date voice minutes for the pool."],
    [
      "Plan pools",
      "allowance_mb",
      "Included pool data allowance (MB) for the plan, including current-month pool top-ups.",
    ],
    [
      "Plan pools",
      "pool_utilisation_pct",
      "ctd_mb ÷ allowance_mb × 100 (0 when allowance is PAYG / zero).",
    ],
    [
      "Plan pools",
      "excess_data_mb",
      "How far ctd_mb is above allowance_mb (0 when under allowance).",
    ],
    [
      "Plan pools",
      "excess_sms",
      "How far ctd_sms is above the plan SMS allowance (0 when PAYG or under).",
    ],
    [
      "Plan pools",
      "excess_voice_min",
      "How far ctd_voice_min is above the plan voice allowance (0 when PAYG or under).",
    ],
    [
      "Plan pools",
      "topups_count",
      "Number of pool top-up purchases for this Reseller Plan in the month.",
    ],
    [
      "Plan pools",
      "topup_sim_units",
      "Total SIM units purchased as pool top-ups for this plan in the month.",
    ],
    [
      "Plan pools",
      "unit_price_aud",
      "Contract unit price (AUD) for one SIM on this Reseller Plan.",
    ],
    [
      "Top-ups",
      "(tab)",
      "One row per pool top-up purchase in the month (not per ICCID).",
    ],
    ["Top-ups", "organisation", "Reseller organisation name."],
    ["Top-ups", "month", "Sydney billing month the top-up applies to (YYYY-MM)."],
    ["Top-ups", "when", "UTC timestamp when the top-up was purchased."],
    ["Top-ups", "reseller_plan", "Reseller Plan pool that received the top-up."],
    [
      "Top-ups",
      "sim_units",
      "How many SIM units were bought (each unit adds one per-SIM data allowance to the pool).",
    ],
    ["Top-ups", "unit_price_aud", "Contract unit price (AUD) charged per SIM unit for this purchase."],
    ["Top-ups", "per_sim_mb", "Data MB added to the pool per SIM unit."],
    ["Top-ups", "allowance_mb", "Total data MB added by this purchase (per_sim_mb × sim_units)."],
    ["Top-ups", "charge_aud", "AUD charged for this purchase (unit_price_aud × sim_units)."],
    ["Top-ups", "by", "Email of the user who bought the top-up."],
  ];

  const sheets = [
    sheetXml("Column guide", legendRows),
    sheetXml("ICCID charges", iccidRows),
    sheetXml("Plan pools", planRows),
    sheetXml("Top-ups", topupRows),
  ].join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
${sheets}
</Workbook>`;
}

/** Month keys for UI picker (current + previous 11). */
export function invoiceMonthOptions(at: Date = new Date()): string[] {
  const out: string[] = [];
  let { year, month } = sydneyYmd(at);
  for (let i = 0; i < 12; i += 1) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}
