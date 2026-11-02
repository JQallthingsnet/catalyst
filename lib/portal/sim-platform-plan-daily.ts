import { getDB } from "@/lib/env";
import { portalTableHasColumn } from "@/lib/portal/d1-compat";
import { loadPlatformPlanRecord } from "@/lib/portal/platform-plans";
import { sydneyDayKey, sydneyMonthStartDayKey } from "@/lib/portal/time";

export type SimPlatformPlanDailyPlan = {
  platformPlanId: string;
  planName: string;
  supplierCode: string | null;
  /** Contract unit price AUD (0 if unknown / off-contract). */
  unitPriceAud: number;
  /** True when this is the plan billed for the day (highest unit price). */
  billed: boolean;
};

export type SimPlatformPlanDailyCell = {
  day: string;
  planCount: number;
  plans: SimPlatformPlanDailyPlan[];
  /** platform_plan_id chosen for billing that day. */
  billedPlatformPlanId: string | null;
};

/** Higher unit price wins; ties → default flag, then name. */
export function pickBilledPlatformPlanId(
  plans: Array<{
    platformPlanId: string;
    planName: string;
    unitPriceAud: number;
    isDefault?: boolean;
  }>,
): string | null {
  if (plans.length === 0) return null;
  const sorted = [...plans].sort((a, b) => {
    if (b.unitPriceAud !== a.unitPriceAud) return b.unitPriceAud - a.unitPriceAud;
    if (Boolean(b.isDefault) !== Boolean(a.isDefault)) return Number(b.isDefault) - Number(a.isDefault);
    return a.planName.localeCompare(b.planName, undefined, { sensitivity: "base" });
  });
  return sorted[0]?.platformPlanId ?? null;
}

export type SimPlatformPlanDailyMatrixRow = {
  iccid: string;
  tenantId?: string;
  /** Present when matrix spans more than one organisation (super admin). */
  organisationName?: string | null;
  cells: SimPlatformPlanDailyCell[];
};

export type SimPlatformPlanDailyMatrix = {
  days: string[];
  rows: SimPlatformPlanDailyMatrixRow[];
  /** True when rows may include multiple organisations. */
  includeOrganisation: boolean;
};

function enumerateSydneyDays(dateFrom: string, dateTo: string): string[] {
  const from = dateFrom.trim();
  const to = dateTo.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return [];
  }
  const days: string[] = [];
  // Walk UTC midnight labels — Sydney day keys are YMD strings we already store.
  let cursor = from;
  while (cursor <= to && days.length < 62) {
    days.push(cursor);
    const [y, m, d] = cursor.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    cursor = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  }
  return days;
}

/**
 * ICCID × every Sydney calendar day in From/To (inclusive).
 * Pass tenantId for one org; omit for super admin (all organisations).
 */
export async function listSimPlatformPlanDailyMatrix(input: {
  tenantId?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Max ICCID rows (newest activity first). */
  limitIccids?: number;
}): Promise<SimPlatformPlanDailyMatrix> {
  const tenantId = input.tenantId?.trim() || "";
  const includeOrganisation = !tenantId;

  const dateTo = input.dateTo?.trim() || sydneyDayKey();
  const dateFrom = input.dateFrom?.trim() || sydneyMonthStartDayKey();
  const days = enumerateSydneyDays(dateFrom, dateTo);
  if (days.length === 0) return { days: [], rows: [], includeOrganisation };

  const limit = Math.min(
    Math.max(input.limitIccids ?? (includeOrganisation ? 1000 : 200), 1),
    includeOrganisation ? 2000 : 500,
  );
  const db = getDB();

  const iccidRows = tenantId
    ? await db
        .prepare(
          `SELECT d.tenant_id, d.iccid, t.name AS organisation_name
           FROM sim_platform_plan_daily d
           JOIN tenants t ON t.id = d.tenant_id
           WHERE d.tenant_id = ? AND d.day >= ? AND d.day <= ?
           GROUP BY d.tenant_id, d.iccid
           ORDER BY MAX(d.day) DESC, d.iccid ASC
           LIMIT ?`,
        )
        .bind(tenantId, dateFrom, dateTo, limit)
        .all<{ tenant_id: string; iccid: string; organisation_name: string }>()
    : await db
        .prepare(
          `SELECT d.tenant_id, d.iccid, t.name AS organisation_name
           FROM sim_platform_plan_daily d
           JOIN tenants t ON t.id = d.tenant_id
           WHERE d.day >= ? AND d.day <= ?
           GROUP BY d.tenant_id, d.iccid
           ORDER BY MAX(d.day) DESC, t.name COLLATE NOCASE, d.iccid ASC
           LIMIT ?`,
        )
        .bind(dateFrom, dateTo, limit)
        .all<{ tenant_id: string; iccid: string; organisation_name: string }>();

  const iccidMeta = (iccidRows.results ?? []).map((row) => ({
    key: `${row.tenant_id}:${row.iccid}`,
    tenantId: row.tenant_id,
    iccid: row.iccid,
    organisationName: row.organisation_name,
  }));
  if (iccidMeta.length === 0) return { days, rows: [], includeOrganisation };

  const pairClauses = iccidMeta.map(() => "(tenant_id = ? AND iccid = ?)").join(" OR ");
  const pairBinds = iccidMeta.flatMap((row) => [row.tenantId, row.iccid]);
  const detailRows = await db
    .prepare(
      `SELECT tenant_id, iccid, day, platform_plan_id, plan_name, supplier_code
       FROM sim_platform_plan_daily
       WHERE day >= ? AND day <= ?
         AND (${pairClauses})
       ORDER BY iccid ASC, day ASC, plan_name COLLATE NOCASE`,
    )
    .bind(dateFrom, dateTo, ...pairBinds)
    .all<{
      tenant_id: string;
      iccid: string;
      day: string;
      platform_plan_id: string;
      plan_name: string;
      supplier_code: string | null;
    }>();

  const tenantIds = [...new Set(iccidMeta.map((row) => row.tenantId))];
  const priceByTenantPlan = new Map<string, { unitPriceAud: number; isDefault: boolean }>();
  if (tenantIds.length > 0) {
    const hasUnitPrice = await portalTableHasColumn("tenant_plan_assignments", "unit_price_aud");
    const hasValueRank = await portalTableHasColumn("tenant_plan_assignments", "value_rank");
    const priceExpr = hasUnitPrice
      ? "IFNULL(unit_price_aud, 0)"
      : hasValueRank
        ? "IFNULL(value_rank, 0)"
        : "0";
    const placeholders = tenantIds.map(() => "?").join(", ");
    const priceRows = await db
      .prepare(
        `SELECT tenant_id, platform_plan_id, ${priceExpr} AS unit_price_aud,
                IFNULL(is_default, 0) AS is_default
         FROM tenant_plan_assignments
         WHERE tenant_id IN (${placeholders})`,
      )
      .bind(...tenantIds)
      .all<{
        tenant_id: string;
        platform_plan_id: string;
        unit_price_aud: number;
        is_default: number;
      }>();
    for (const row of priceRows.results ?? []) {
      priceByTenantPlan.set(`${row.tenant_id}:${row.platform_plan_id}`, {
        unitPriceAud: Number(row.unit_price_aud) || 0,
        isDefault: Boolean(row.is_default),
      });
    }
  }

  type RankedDayPlan = {
    platformPlanId: string;
    planName: string;
    supplierCode: string | null;
    unitPriceAud: number;
    isDefault: boolean;
  };
  const byKey = new Map<string, Map<string, RankedDayPlan[]>>();
  for (const meta of iccidMeta) byKey.set(meta.key, new Map());
  for (const row of detailRows.results ?? []) {
    const dayMap = byKey.get(`${row.tenant_id}:${row.iccid}`);
    if (!dayMap) continue;
    const price = priceByTenantPlan.get(`${row.tenant_id}:${row.platform_plan_id}`);
    const list = dayMap.get(row.day) ?? [];
    list.push({
      platformPlanId: row.platform_plan_id,
      planName: row.plan_name,
      supplierCode: row.supplier_code,
      unitPriceAud: price?.unitPriceAud ?? 0,
      isDefault: price?.isDefault ?? false,
    });
    dayMap.set(row.day, list);
  }

  const rows: SimPlatformPlanDailyMatrixRow[] = iccidMeta.map((meta) => {
    const dayMap = byKey.get(meta.key) ?? new Map<string, RankedDayPlan[]>();
    return {
      iccid: meta.iccid,
      tenantId: meta.tenantId,
      organisationName: includeOrganisation ? meta.organisationName : null,
      cells: days.map((day) => {
        const raw: RankedDayPlan[] = dayMap.get(day) ?? [];
        const billedId = pickBilledPlatformPlanId(raw);
        const plans: SimPlatformPlanDailyPlan[] = raw
          .map((plan: RankedDayPlan) => ({
            platformPlanId: plan.platformPlanId,
            planName: plan.planName,
            supplierCode: plan.supplierCode,
            unitPriceAud: plan.unitPriceAud,
            billed: plan.platformPlanId === billedId,
          }))
          .sort((a: SimPlatformPlanDailyPlan, b: SimPlatformPlanDailyPlan) => {
            if (a.billed !== b.billed) return a.billed ? -1 : 1;
            if (b.unitPriceAud !== a.unitPriceAud) return b.unitPriceAud - a.unitPriceAud;
            return a.planName.localeCompare(b.planName, undefined, { sensitivity: "base" });
          });
        return {
          day,
          planCount: plans.length,
          plans,
          billedPlatformPlanId: billedId,
        };
      }),
    };
  });

  return { days, rows, includeOrganisation };
}

/** Record that this Reseller Plan applied to the ICCID on a Sydney calendar day. */
export async function recordSimPlatformPlanDay(input: {
  tenantId: string;
  iccid: string;
  platformPlanId: string;
  planName?: string | null;
  supplierCode?: string | null;
  day?: string;
  at?: Date;
}): Promise<void> {
  const iccid = input.iccid.replace(/\s/g, "");
  const platformPlanId = input.platformPlanId.trim();
  if (!iccid || !platformPlanId) return;

  let planName = input.planName?.trim() ?? "";
  let supplierCode = input.supplierCode?.trim() || null;
  if (!planName || supplierCode == null) {
    const plan = await loadPlatformPlanRecord(platformPlanId);
    if (!plan) return;
    planName = planName || plan.name.trim();
    supplierCode = supplierCode ?? plan.cc_rate_plan?.trim() ?? null;
  }
  if (!planName) return;

  const day = input.day ?? sydneyDayKey(input.at ?? new Date());
  const recordedAt = (input.at ?? new Date()).toISOString();
  await getDB()
    .prepare(
      `INSERT INTO sim_platform_plan_daily
         (tenant_id, iccid, day, platform_plan_id, plan_name, supplier_code, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id, iccid, day, platform_plan_id) DO UPDATE SET
         plan_name = excluded.plan_name,
         supplier_code = COALESCE(excluded.supplier_code, sim_platform_plan_daily.supplier_code),
         recorded_at = excluded.recorded_at`,
    )
    .bind(input.tenantId, iccid, day, platformPlanId, planName, supplierCode, recordedAt)
    .run();
}

/**
 * Stamp today’s Reseller Plan for every SIM that has one.
 * Ensures days with no plan change still appear in the daily usage log.
 */
export async function snapshotSimPlatformPlanDaily(day = sydneyDayKey()): Promise<number> {
  const db = getDB();
  const now = new Date().toISOString();
  const rows = await db
    .prepare(
      `SELECT s.tenant_id, s.iccid, s.platform_plan_id, p.name AS plan_name, p.cc_rate_plan AS supplier_code
       FROM sims s
       JOIN platform_plans p ON p.id = s.platform_plan_id
       WHERE s.platform_plan_id IS NOT NULL AND TRIM(s.platform_plan_id) != ''`,
    )
    .all<{
      tenant_id: string;
      iccid: string;
      platform_plan_id: string;
      plan_name: string;
      supplier_code: string | null;
    }>();

  const statements = (rows.results ?? []).map((row) =>
    db
      .prepare(
        `INSERT INTO sim_platform_plan_daily
           (tenant_id, iccid, day, platform_plan_id, plan_name, supplier_code, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(tenant_id, iccid, day, platform_plan_id) DO UPDATE SET
           plan_name = excluded.plan_name,
           supplier_code = COALESCE(excluded.supplier_code, sim_platform_plan_daily.supplier_code),
           recorded_at = excluded.recorded_at`,
      )
      .bind(
        row.tenant_id,
        row.iccid,
        day,
        row.platform_plan_id,
        row.plan_name,
        row.supplier_code,
        now,
      ),
  );

  for (let i = 0; i < statements.length; i += 40) {
    await db.batch(statements.slice(i, i + 40));
  }
  return statements.length;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** CSV: day, ICCID, Reseller Plan (and optional organisation / Supplier code for ATN). */
export async function exportSimPlatformPlanDailyCsv(input: {
  tenantId?: string;
  dateFrom?: string;
  dateTo?: string;
  includeOrganisation?: boolean;
  /** Jasper Supplier code column — super admin only. */
  includeSupplierCode?: boolean;
}): Promise<string> {
  const clauses: string[] = [];
  const binds: Array<string> = [];
  if (input.tenantId?.trim()) {
    clauses.push("d.tenant_id = ?");
    binds.push(input.tenantId.trim());
  }
  if (input.dateFrom?.trim()) {
    clauses.push("d.day >= ?");
    binds.push(input.dateFrom.trim());
  }
  if (input.dateTo?.trim()) {
    clauses.push("d.day <= ?");
    binds.push(input.dateTo.trim());
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const rows = await getDB()
    .prepare(
      `SELECT d.day, d.iccid, d.tenant_id, d.platform_plan_id, d.plan_name, d.supplier_code,
              t.name AS organisation
       FROM sim_platform_plan_daily d
       JOIN tenants t ON t.id = d.tenant_id
       ${where}
       ORDER BY d.day DESC, d.iccid ASC, d.plan_name COLLATE NOCASE
       LIMIT 100000`,
    )
    .bind(...binds)
    .all<{
      day: string;
      iccid: string;
      tenant_id: string;
      platform_plan_id: string;
      plan_name: string;
      supplier_code: string | null;
      organisation: string;
    }>();

  const hasUnitPrice = await portalTableHasColumn("tenant_plan_assignments", "unit_price_aud");
  const hasValueRank = await portalTableHasColumn("tenant_plan_assignments", "value_rank");
  const priceExpr = hasUnitPrice
    ? "IFNULL(unit_price_aud, 0)"
    : hasValueRank
      ? "IFNULL(value_rank, 0)"
      : "0";
  const priceRows = await getDB()
    .prepare(
      `SELECT tenant_id, platform_plan_id, ${priceExpr} AS unit_price_aud,
              IFNULL(is_default, 0) AS is_default
       FROM tenant_plan_assignments`,
    )
    .all<{
      tenant_id: string;
      platform_plan_id: string;
      unit_price_aud: number;
      is_default: number;
    }>();
  const priceByTenantPlan = new Map<string, { unitPriceAud: number; isDefault: boolean }>();
  for (const row of priceRows.results ?? []) {
    priceByTenantPlan.set(`${row.tenant_id}:${row.platform_plan_id}`, {
      unitPriceAud: Number(row.unit_price_aud) || 0,
      isDefault: Boolean(row.is_default),
    });
  }

  // Group same-day plans per ICCID to mark the billed (highest unit price) row.
  type ExportRow = {
    day: string;
    iccid: string;
    tenant_id: string;
    platform_plan_id: string;
    plan_name: string;
    supplier_code: string | null;
    organisation: string;
    unitPriceAud: number;
    billed: boolean;
  };
  const grouped = new Map<string, ExportRow[]>();
  for (const row of rows.results ?? []) {
    const price = priceByTenantPlan.get(`${row.tenant_id}:${row.platform_plan_id}`);
    const key = `${row.tenant_id}:${row.iccid}:${row.day}`;
    const list = grouped.get(key) ?? [];
    list.push({
      ...row,
      unitPriceAud: price?.unitPriceAud ?? 0,
      billed: false,
    });
    grouped.set(key, list);
  }
  const exportRows: ExportRow[] = [];
  for (const list of grouped.values()) {
    const billedId = pickBilledPlatformPlanId(
      list.map((row) => ({
        platformPlanId: row.platform_plan_id,
        planName: row.plan_name,
        unitPriceAud: row.unitPriceAud,
        isDefault: priceByTenantPlan.get(`${row.tenant_id}:${row.platform_plan_id}`)?.isDefault,
      })),
    );
    for (const row of list) {
      exportRows.push({ ...row, billed: row.platform_plan_id === billedId });
    }
  }
  exportRows.sort((a, b) => {
    if (a.day !== b.day) return b.day.localeCompare(a.day);
    if (a.iccid !== b.iccid) return a.iccid.localeCompare(b.iccid);
    if (a.billed !== b.billed) return a.billed ? -1 : 1;
    return a.plan_name.localeCompare(b.plan_name);
  });

  const includeOrg = Boolean(input.includeOrganisation);
  const includeSupplier = Boolean(input.includeSupplierCode);
  const header = [
    "day",
    ...(includeOrg ? ["organisation"] : []),
    "iccid",
    "reseller_plan",
    "unit_price_aud",
    "billed",
    ...(includeSupplier ? ["supplier_code"] : []),
  ];
  const lines = [header.join(",")];
  for (const row of exportRows) {
    const cells = [
      row.day,
      ...(includeOrg ? [row.organisation] : []),
      row.iccid,
      row.plan_name,
      String(row.unitPriceAud),
      row.billed ? "yes" : "no",
      ...(includeSupplier ? [row.supplier_code ?? ""] : []),
    ];
    lines.push(cells.map((cell) => csvEscape(String(cell))).join(","));
  }
  return `${lines.join("\n")}\n`;
}
