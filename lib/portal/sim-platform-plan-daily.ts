import { getDB } from "@/lib/env";
import { loadPlatformPlanRecord } from "@/lib/portal/platform-plans";
import { sydneyDayKey, sydneyDayKeyDaysAgo } from "@/lib/portal/time";

export type SimPlatformPlanDailyPlan = {
  platformPlanId: string;
  planName: string;
  supplierCode: string | null;
};

export type SimPlatformPlanDailyCell = {
  day: string;
  planCount: number;
  plans: SimPlatformPlanDailyPlan[];
};

export type SimPlatformPlanDailyMatrixRow = {
  iccid: string;
  cells: SimPlatformPlanDailyCell[];
};

export type SimPlatformPlanDailyMatrix = {
  days: string[];
  rows: SimPlatformPlanDailyMatrixRow[];
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

/** ICCID × day matrix for one organisation (plan count + plan details per cell). */
export async function listSimPlatformPlanDailyMatrix(input: {
  tenantId: string;
  dateFrom?: string;
  dateTo?: string;
  /** Max ICCID rows (newest activity first). */
  limitIccids?: number;
}): Promise<SimPlatformPlanDailyMatrix> {
  const tenantId = input.tenantId.trim();
  if (!tenantId) return { days: [], rows: [] };

  const dateTo = input.dateTo?.trim() || sydneyDayKey();
  const dateFrom = input.dateFrom?.trim() || sydneyDayKeyDaysAgo(13);
  const days = enumerateSydneyDays(dateFrom, dateTo);
  if (days.length === 0) return { days: [], rows: [] };

  const limit = Math.min(Math.max(input.limitIccids ?? 200, 1), 500);
  const db = getDB();

  const iccidRows = await db
    .prepare(
      `SELECT iccid
       FROM sim_platform_plan_daily
       WHERE tenant_id = ? AND day >= ? AND day <= ?
       GROUP BY iccid
       ORDER BY MAX(day) DESC, iccid ASC
       LIMIT ?`,
    )
    .bind(tenantId, dateFrom, dateTo, limit)
    .all<{ iccid: string }>();
  const iccids = (iccidRows.results ?? []).map((row) => row.iccid);
  if (iccids.length === 0) return { days, rows: [] };

  const placeholders = iccids.map(() => "?").join(", ");
  const detailRows = await db
    .prepare(
      `SELECT iccid, day, platform_plan_id, plan_name, supplier_code
       FROM sim_platform_plan_daily
       WHERE tenant_id = ?
         AND day >= ? AND day <= ?
         AND iccid IN (${placeholders})
       ORDER BY iccid ASC, day ASC, plan_name COLLATE NOCASE`,
    )
    .bind(tenantId, dateFrom, dateTo, ...iccids)
    .all<{
      iccid: string;
      day: string;
      platform_plan_id: string;
      plan_name: string;
      supplier_code: string | null;
    }>();

  const byIccid = new Map<string, Map<string, SimPlatformPlanDailyPlan[]>>();
  for (const iccid of iccids) byIccid.set(iccid, new Map());
  for (const row of detailRows.results ?? []) {
    const dayMap = byIccid.get(row.iccid);
    if (!dayMap) continue;
    const list = dayMap.get(row.day) ?? [];
    list.push({
      platformPlanId: row.platform_plan_id,
      planName: row.plan_name,
      supplierCode: row.supplier_code,
    });
    dayMap.set(row.day, list);
  }

  const rows: SimPlatformPlanDailyMatrixRow[] = iccids.map((iccid) => {
    const dayMap = byIccid.get(iccid) ?? new Map();
    return {
      iccid,
      cells: days.map((day) => {
        const plans = dayMap.get(day) ?? [];
        return { day, planCount: plans.length, plans };
      }),
    };
  });

  return { days, rows };
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

/** CSV: day, ICCID, Reseller Plan, Supplier code (and optional organisation). */
export async function exportSimPlatformPlanDailyCsv(input: {
  tenantId?: string;
  dateFrom?: string;
  dateTo?: string;
  includeOrganisation?: boolean;
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
      `SELECT d.day, d.iccid, d.plan_name, d.supplier_code, t.name AS organisation
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
      plan_name: string;
      supplier_code: string | null;
      organisation: string;
    }>();

  const includeOrg = Boolean(input.includeOrganisation);
  const header = includeOrg
    ? ["day", "organisation", "iccid", "reseller_plan", "supplier_code"]
    : ["day", "iccid", "reseller_plan", "supplier_code"];
  const lines = [header.join(",")];
  for (const row of rows.results ?? []) {
    const cells = includeOrg
      ? [row.day, row.organisation, row.iccid, row.plan_name, row.supplier_code ?? ""]
      : [row.day, row.iccid, row.plan_name, row.supplier_code ?? ""];
    lines.push(cells.map((cell) => csvEscape(String(cell))).join(","));
  }
  return `${lines.join("\n")}\n`;
}
