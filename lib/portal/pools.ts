import { getDB } from "@/lib/env";
import type { UsageAllowanceBasis } from "@/lib/portal/sim-usage";
import { sydneyDayKey, sydneyDayKeyDaysAgo } from "@/lib/portal/time";

/** Default chart window: daily points accumulate on the date axis. */
export const POOL_SERIES_DEFAULT_DAYS = 90;

export type ModemAllowanceRow = {
  modemId: string;
  allowanceMb: number | null;
  customer: string | null;
  simCount: number;
  ctdUsageMb: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type PoolCustomerDay = {
  customer: string;
  day: string;
  ctdUsageMb: number;
  allowanceMb: number;
  modemCount: number;
  simCount: number;
  snapshottedAt: string;
};

export type PoolCustomerLatest = PoolCustomerDay & {
  pct: number;
};

/** Super-admin Pools row: grouped by Jasper rate plan. */
export type PoolRatePlanDay = {
  ratePlan: string;
  day: string;
  ctdUsageMb: number;
  allowanceMb: number;
  simCount: number;
  snapshottedAt: string;
};

export type PoolRatePlanLatest = PoolRatePlanDay & {
  pct: number;
};

/** Reseller Pools row: grouped by modem_ID. */
export type PoolModemDay = {
  modemId: string;
  customer: string | null;
  day: string;
  ctdUsageMb: number;
  allowanceMb: number;
  simCount: number;
  snapshottedAt: string;
};

export type PoolModemLatest = PoolModemDay & {
  pct: number;
};

/** Dashboard entity row (rate plan / modem_ID / customer). */
export type PoolEntityLatest = {
  name: string;
  day: string;
  ctdUsageMb: number;
  allowanceMb: number;
  modemCount: number;
  simCount: number;
  pct: number;
  /** CC customer when grouping by modem_ID. */
  customer?: string | null;
};

/** Distinct modem_IDs from CC snapshot with optional manual allowance. */
export async function listModemAllowances(input?: {
  q?: string;
  /** Exact Jasper/CC customer (reseller scope). */
  exactCustomer?: string;
}): Promise<ModemAllowanceRow[]> {
  const q = input?.q?.trim() ?? "";
  // undefined = unrestricted (super admin); "" = reseller unbound → empty.
  if (input?.exactCustomer !== undefined && !input.exactCustomer.trim()) return [];
  const exact = input?.exactCustomer?.trim() ?? "";

  const rows = await getDB()
    .prepare(
      `SELECT d.modem_id AS modem_id,
              MAX(d.customer) AS customer,
              COUNT(*) AS sim_count,
              IFNULL(SUM(d.ctd_usage_mb), 0) AS ctd_usage_mb,
              a.allowance_mb AS allowance_mb,
              a.updated_at AS updated_at,
              a.updated_by AS updated_by
       FROM cc_devices d
       LEFT JOIN modem_allowances a ON a.modem_id = d.modem_id
       WHERE d.modem_id IS NOT NULL AND TRIM(d.modem_id) != ''
         AND (? = '' OR IFNULL(d.customer, '') = ?)
         AND (? = '' OR d.modem_id LIKE ? OR IFNULL(d.customer, '') LIKE ?)
       GROUP BY d.modem_id
       ORDER BY modem_id COLLATE NOCASE
       LIMIT 2000`,
    )
    .bind(exact, exact, q, `%${q}%`, `%${q}%`)
    .all<{
      modem_id: string;
      customer: string | null;
      sim_count: number;
      ctd_usage_mb: number;
      allowance_mb: number | null;
      updated_at: string | null;
      updated_by: string | null;
    }>();

  return (rows.results ?? []).map((row) => ({
    modemId: row.modem_id,
    allowanceMb: row.allowance_mb,
    customer: row.customer,
    simCount: row.sim_count,
    ctdUsageMb: row.ctd_usage_mb,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

export async function setModemAllowance(
  modemId: string,
  allowanceMb: number,
  actorEmail: string,
): Promise<void> {
  const id = modemId.trim();
  if (!id) throw new Error("Reseller Plan is required.");
  if (!Number.isFinite(allowanceMb) || allowanceMb < 0) {
    throw new Error("Allowance must be a non-negative number of MB.");
  }
  const now = new Date().toISOString();
  await getDB()
    .prepare(
      `INSERT INTO modem_allowances (modem_id, allowance_mb, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(modem_id) DO UPDATE SET
         allowance_mb = excluded.allowance_mb,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .bind(id, allowanceMb, now, actorEmail)
    .run();
}

export async function clearModemAllowance(modemId: string): Promise<void> {
  const id = modemId.trim();
  if (!id) throw new Error("Reseller Plan is required.");
  await getDB().prepare("DELETE FROM modem_allowances WHERE modem_id = ?").bind(id).run();
}

export type RatePlanAllowanceRow = {
  ratePlan: string;
  allowanceMb: number | null;
  simCount: number;
  ctdUsageMb: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

/** Distinct Jasper/CC rate plans with optional manual allowance (super-admin Usage). */
export async function listRatePlanAllowances(): Promise<RatePlanAllowanceRow[]> {
  const rows = await getDB()
    .prepare(
      `SELECT d.rate_plan AS rate_plan,
              COUNT(*) AS sim_count,
              IFNULL(SUM(d.ctd_usage_mb), 0) AS ctd_usage_mb,
              a.allowance_mb AS allowance_mb,
              a.updated_at AS updated_at,
              a.updated_by AS updated_by
       FROM cc_devices d
       LEFT JOIN rate_plan_allowances a ON a.rate_plan = d.rate_plan
       WHERE d.rate_plan IS NOT NULL AND TRIM(d.rate_plan) != ''
       GROUP BY d.rate_plan
       ORDER BY rate_plan COLLATE NOCASE
       LIMIT 2000`,
    )
    .all<{
      rate_plan: string;
      sim_count: number;
      ctd_usage_mb: number;
      allowance_mb: number | null;
      updated_at: string | null;
      updated_by: string | null;
    }>();

  return (rows.results ?? []).map((row) => ({
    ratePlan: row.rate_plan,
    allowanceMb: row.allowance_mb,
    simCount: row.sim_count,
    ctdUsageMb: row.ctd_usage_mb,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

export async function setRatePlanAllowance(
  ratePlan: string,
  allowanceMb: number,
  actorEmail: string,
): Promise<void> {
  const id = ratePlan.trim();
  if (!id) throw new Error("Rate plan is required.");
  if (!Number.isFinite(allowanceMb) || allowanceMb < 0) {
    throw new Error("Allowance must be a non-negative number of MB.");
  }
  const now = new Date().toISOString();
  await getDB()
    .prepare(
      `INSERT INTO rate_plan_allowances (rate_plan, allowance_mb, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(rate_plan) DO UPDATE SET
         allowance_mb = excluded.allowance_mb,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .bind(id, allowanceMb, now, actorEmail)
    .run();
}

export async function clearRatePlanAllowance(ratePlan: string): Promise<void> {
  const id = ratePlan.trim();
  if (!id) throw new Error("Rate plan is required.");
  await getDB().prepare("DELETE FROM rate_plan_allowances WHERE rate_plan = ?").bind(id).run();
}

/**
 * Snapshot for the Sydney day (upsert).
 * - pool_rate_plan_daily: super-admin Pools (group by rate plan)
 * - pool_modem_daily: reseller Pools (group by modem_ID, scoped by CC customer)
 * - pool_customer_daily: kept for history / rollups
 * Full run writes all. Scoped reseller snapshot updates customer + modem rows only.
 */
export async function snapshotPoolCustomerDaily(
  day = sydneyDayKey(),
  opts?: { customers?: string[] },
): Promise<number> {
  const only =
    opts?.customers?.map((c) => c.trim()).filter(Boolean).map((c) => c.toLowerCase()) ?? null;
  if (only && only.length === 0) return 0;
  const writeRatePlans = only == null;

  const db = getDB();
  const deviceRows = await db
    .prepare(
      `SELECT customer, modem_id, rate_plan, IFNULL(ctd_usage_mb, 0) AS ctd_usage_mb
       FROM cc_devices
       WHERE (customer IS NOT NULL AND TRIM(customer) != '')
          OR (rate_plan IS NOT NULL AND TRIM(rate_plan) != '')
          OR (modem_id IS NOT NULL AND TRIM(modem_id) != '')`,
    )
    .all<{
      customer: string | null;
      modem_id: string | null;
      rate_plan: string | null;
      ctd_usage_mb: number;
    }>();

  const [modemAllowanceRows, ratePlanAllowanceRows] = await Promise.all([
    db.prepare("SELECT modem_id, allowance_mb FROM modem_allowances").all<{
      modem_id: string;
      allowance_mb: number;
    }>(),
    db.prepare("SELECT rate_plan, allowance_mb FROM rate_plan_allowances").all<{
      rate_plan: string;
      allowance_mb: number;
    }>(),
  ]);
  const allowanceByModem = new Map(
    (modemAllowanceRows.results ?? []).map((row) => [row.modem_id, row.allowance_mb]),
  );
  const allowanceByRatePlan = new Map(
    (ratePlanAllowanceRows.results ?? []).map((row) => [row.rate_plan, row.allowance_mb]),
  );

  type CustomerAgg = {
    ctd: number;
    modemAllowance: number;
    ratePlanAllowance: number;
    simCount: number;
    simsWithModem: number;
  };
  type RatePlanAgg = { ctd: number; allowance: number; simCount: number };
  type ModemAgg = { ctd: number; allowance: number; simCount: number; customer: string | null };
  const byCustomer = new Map<string, CustomerAgg>();
  const byRatePlan = new Map<string, RatePlanAgg>();
  const byModem = new Map<string, ModemAgg>();

  for (const row of deviceRows.results ?? []) {
    const ctd = row.ctd_usage_mb ?? 0;
    const customer = row.customer?.trim() ?? "";
    const inCustomerScope = !only || (customer !== "" && only.includes(customer.toLowerCase()));

    if (customer && inCustomerScope) {
      let agg = byCustomer.get(customer);
      if (!agg) {
        agg = { ctd: 0, modemAllowance: 0, ratePlanAllowance: 0, simCount: 0, simsWithModem: 0 };
        byCustomer.set(customer, agg);
      }
      agg.ctd += ctd;
      agg.simCount += 1;
      const modem = row.modem_id?.trim();
      if (modem) {
        agg.simsWithModem += 1;
        agg.modemAllowance += allowanceByModem.get(modem) ?? 0;
      }
      const rp = row.rate_plan?.trim();
      if (rp) agg.ratePlanAllowance += allowanceByRatePlan.get(rp) ?? 0;
    }

    if (writeRatePlans) {
      const ratePlan = row.rate_plan?.trim() ?? "";
      if (ratePlan) {
        let agg = byRatePlan.get(ratePlan);
        if (!agg) {
          agg = { ctd: 0, allowance: 0, simCount: 0 };
          byRatePlan.set(ratePlan, agg);
        }
        agg.ctd += ctd;
        agg.simCount += 1;
        agg.allowance += allowanceByRatePlan.get(ratePlan) ?? 0;
      }
    }

    if (inCustomerScope) {
      const modemId = row.modem_id?.trim() ?? "";
      if (modemId) {
        let agg = byModem.get(modemId);
        if (!agg) {
          agg = { ctd: 0, allowance: 0, simCount: 0, customer: customer || null };
          byModem.set(modemId, agg);
        }
        agg.ctd += ctd;
        agg.simCount += 1;
        // Per-SIM application: same modem_ID on N SIMs counts N times.
        agg.allowance += allowanceByModem.get(modemId) ?? 0;
        if (customer) agg.customer = customer;
      }
    }
  }

  const now = new Date().toISOString();
  const statements = [];
  for (const [customer, agg] of byCustomer) {
    statements.push(
      db
        .prepare(
          `INSERT INTO pool_customer_daily
             (customer, day, ctd_usage_mb, allowance_mb, rate_plan_allowance_mb,
              modem_count, sim_count, snapshotted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(customer, day) DO UPDATE SET
             ctd_usage_mb = excluded.ctd_usage_mb,
             allowance_mb = excluded.allowance_mb,
             rate_plan_allowance_mb = excluded.rate_plan_allowance_mb,
             modem_count = excluded.modem_count,
             sim_count = excluded.sim_count,
             snapshotted_at = excluded.snapshotted_at`,
        )
        .bind(
          customer,
          day,
          agg.ctd,
          agg.modemAllowance,
          agg.ratePlanAllowance,
          agg.simsWithModem,
          agg.simCount,
          now,
        ),
    );
  }
  for (const [ratePlan, agg] of byRatePlan) {
    statements.push(
      db
        .prepare(
          `INSERT INTO pool_rate_plan_daily
             (rate_plan, day, ctd_usage_mb, allowance_mb, sim_count, snapshotted_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(rate_plan, day) DO UPDATE SET
             ctd_usage_mb = excluded.ctd_usage_mb,
             allowance_mb = excluded.allowance_mb,
             sim_count = excluded.sim_count,
             snapshotted_at = excluded.snapshotted_at`,
        )
        .bind(ratePlan, day, agg.ctd, agg.allowance, agg.simCount, now),
    );
  }
  for (const [modemId, agg] of byModem) {
    statements.push(
      db
        .prepare(
          `INSERT INTO pool_modem_daily
             (modem_id, day, customer, ctd_usage_mb, allowance_mb, sim_count, snapshotted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(modem_id, day) DO UPDATE SET
             customer = excluded.customer,
             ctd_usage_mb = excluded.ctd_usage_mb,
             allowance_mb = excluded.allowance_mb,
             sim_count = excluded.sim_count,
             snapshotted_at = excluded.snapshotted_at`,
        )
        .bind(modemId, day, agg.customer, agg.ctd, agg.allowance, agg.simCount, now),
    );
  }

  for (let i = 0; i < statements.length; i += 40) {
    await db.batch(statements.slice(i, i + 40));
  }
  if (writeRatePlans) return byRatePlan.size;
  return byModem.size;
}

/** Run at most once per Sydney day from cron (cheap existence check). */
export async function snapshotPoolCustomerDailyIfNeeded(): Promise<number | null> {
  const day = sydneyDayKey();
  const db = getDB();
  const [cust, plan, modem] = await Promise.all([
    db
      .prepare("SELECT 1 AS ok FROM pool_customer_daily WHERE day = ? LIMIT 1")
      .bind(day)
      .first<{ ok: number }>(),
    db
      .prepare("SELECT 1 AS ok FROM pool_rate_plan_daily WHERE day = ? LIMIT 1")
      .bind(day)
      .first<{ ok: number }>(),
    db
      .prepare("SELECT 1 AS ok FROM pool_modem_daily WHERE day = ? LIMIT 1")
      .bind(day)
      .first<{ ok: number }>(),
  ]);
  if (cust && plan && modem) return null;
  return snapshotPoolCustomerDaily(day);
}

function pickPoolAllowanceMb(
  basis: UsageAllowanceBasis,
  modemAllowanceMb: number | null | undefined,
  ratePlanAllowanceMb: number | null | undefined,
): number {
  return basis === "rate_plan" ? ratePlanAllowanceMb ?? 0 : modemAllowanceMb ?? 0;
}

/**
 * Live Σ allowance per CC customer from current devices + mappings
 * (same tables Usage uses). Prefer this over stale snapshot columns when displaying.
 */
export async function sumLivePoolAllowancesByCustomer(
  basis: UsageAllowanceBasis,
): Promise<Map<string, number>> {
  const join =
    basis === "rate_plan"
      ? "LEFT JOIN rate_plan_allowances a ON a.rate_plan = d.rate_plan"
      : "LEFT JOIN modem_allowances a ON a.modem_id = d.modem_id";
  const rows = await getDB()
    .prepare(
      `SELECT d.customer AS customer,
              IFNULL(SUM(IFNULL(a.allowance_mb, 0)), 0) AS allowance_mb
       FROM cc_devices d
       ${join}
       WHERE d.customer IS NOT NULL AND TRIM(d.customer) != ''
       GROUP BY d.customer`,
    )
    .all<{ customer: string; allowance_mb: number }>();
  return new Map((rows.results ?? []).map((row) => [row.customer, row.allowance_mb ?? 0]));
}

export async function listPoolCustomerLatest(input?: {
  q?: string;
  /** Exact Jasper/CC customer (reseller scope). */
  exactCustomer?: string;
  /** Super admin → rate_plan; reseller → modem. */
  basis?: UsageAllowanceBasis;
}): Promise<PoolCustomerLatest[]> {
  const q = input?.q?.trim() ?? "";
  const basis: UsageAllowanceBasis = input?.basis ?? "modem";
  // undefined = unrestricted (super admin); "" = reseller unbound → empty.
  if (input?.exactCustomer !== undefined && !input.exactCustomer.trim()) return [];
  const exact = input?.exactCustomer?.trim() ?? "";

  const [rows, liveAllowances] = await Promise.all([
    getDB()
      .prepare(
        `SELECT p.customer, p.day, p.ctd_usage_mb, p.allowance_mb, p.rate_plan_allowance_mb,
                p.modem_count, p.sim_count, p.snapshotted_at
         FROM pool_customer_daily p
         INNER JOIN (
           SELECT customer, MAX(day) AS day FROM pool_customer_daily GROUP BY customer
         ) latest ON latest.customer = p.customer AND latest.day = p.day
         WHERE (? = '' OR p.customer = ?)
           AND (? = '' OR p.customer LIKE ?)
         ORDER BY p.customer COLLATE NOCASE
         LIMIT 500`,
      )
      .bind(exact, exact, q, `%${q}%`)
      .all<{
        customer: string;
        day: string;
        ctd_usage_mb: number;
        allowance_mb: number;
        rate_plan_allowance_mb: number | null;
        modem_count: number;
        sim_count: number;
        snapshotted_at: string;
      }>(),
    sumLivePoolAllowancesByCustomer(basis),
  ]);

  return (rows.results ?? []).map((row) => {
    const snapAllowance = pickPoolAllowanceMb(basis, row.allowance_mb, row.rate_plan_allowance_mb);
    const allowanceMb = liveAllowances.get(row.customer) ?? snapAllowance;
    const ctdUsageMb = row.ctd_usage_mb ?? 0;
    return {
      customer: row.customer,
      day: row.day,
      ctdUsageMb,
      allowanceMb,
      modemCount: row.modem_count,
      simCount: row.sim_count,
      snapshottedAt: row.snapshotted_at,
      pct: allowanceMb > 0 ? Math.round((ctdUsageMb / allowanceMb) * 100) : 0,
    };
  });
}

export async function listPoolCustomerSeries(input: {
  customer?: string;
  customers?: string[];
  /** When set (reseller), only these CC customers may be returned. */
  allowedCustomers?: string[];
  basis?: UsageAllowanceBasis;
  fromDay?: string;
  toDay?: string;
  limit?: number;
}): Promise<PoolCustomerDay[]> {
  const basis: UsageAllowanceBasis = input.basis ?? "modem";
  const allowed = (input.allowedCustomers ?? []).map((c) => c.trim()).filter(Boolean);
  if (input.allowedCustomers && allowed.length === 0) return [];

  const fromList = (input.customers ?? []).map((c) => c.trim()).filter(Boolean);
  const single = input.customer?.trim() ?? "";
  let customers = fromList.length > 0 ? fromList : single ? [single] : [];
  if (allowed.length > 0) {
    const allowSet = new Set(allowed.map((c) => c.toLowerCase()));
    customers =
      customers.length > 0
        ? customers.filter((c) => allowSet.has(c.toLowerCase()))
        : allowed;
    if (customers.length === 0) return [];
  }
  const fromDay = input.fromDay?.trim() || sydneyDayKeyDaysAgo(POOL_SERIES_DEFAULT_DAYS - 1);
  const toDay = input.toDay?.trim() || sydneyDayKey();
  const limit = Math.min(Math.max(input.limit ?? 2000, 1), 5000);
  const liveAllowances = await sumLivePoolAllowancesByCustomer(basis);

  if (customers.length === 0) {
    const rows = await getDB()
      .prepare(
        `SELECT customer, day, ctd_usage_mb, allowance_mb, rate_plan_allowance_mb,
                modem_count, sim_count, snapshotted_at
         FROM pool_customer_daily
         WHERE (? = '' OR day >= ?)
           AND (? = '' OR day <= ?)
         ORDER BY day ASC, customer COLLATE NOCASE
         LIMIT ?`,
      )
      .bind(fromDay, fromDay, toDay, toDay, limit)
      .all<{
        customer: string;
        day: string;
        ctd_usage_mb: number;
        allowance_mb: number;
        rate_plan_allowance_mb: number | null;
        modem_count: number;
        sim_count: number;
        snapshotted_at: string;
      }>();
    return (rows.results ?? []).map((row) => mapSeriesRow(row, basis, liveAllowances));
  }

  const placeholders = customers.map(() => "?").join(", ");
  const rows = await getDB()
    .prepare(
      `SELECT customer, day, ctd_usage_mb, allowance_mb, rate_plan_allowance_mb,
              modem_count, sim_count, snapshotted_at
       FROM pool_customer_daily
       WHERE customer IN (${placeholders})
         AND (? = '' OR day >= ?)
         AND (? = '' OR day <= ?)
       ORDER BY day ASC, customer COLLATE NOCASE
       LIMIT ?`,
    )
    .bind(...customers, fromDay, fromDay, toDay, toDay, limit)
    .all<{
      customer: string;
      day: string;
      ctd_usage_mb: number;
      allowance_mb: number;
      rate_plan_allowance_mb: number | null;
      modem_count: number;
      sim_count: number;
      snapshotted_at: string;
    }>();

  return (rows.results ?? []).map((row) => mapSeriesRow(row, basis, liveAllowances));
}

function mapSeriesRow(
  row: {
    customer: string;
    day: string;
    ctd_usage_mb: number;
    allowance_mb: number;
    rate_plan_allowance_mb: number | null;
    modem_count: number;
    sim_count: number;
    snapshotted_at: string;
  },
  basis: UsageAllowanceBasis,
  liveAllowances: Map<string, number>,
): PoolCustomerDay {
  const snapAllowance = pickPoolAllowanceMb(basis, row.allowance_mb, row.rate_plan_allowance_mb);
  return {
    customer: row.customer,
    day: row.day,
    ctdUsageMb: row.ctd_usage_mb,
    // Prefer live mapping so chart/table match Rate plan allowances without a re-snapshot.
    allowanceMb: liveAllowances.get(row.customer) ?? snapAllowance,
    modemCount: row.modem_count,
    simCount: row.sim_count,
    snapshottedAt: row.snapshotted_at,
  };
}

/** Live Σ rate-plan allowance per rate plan (allowance_mb × each SIM on that plan). */
export async function sumLivePoolAllowancesByRatePlan(): Promise<Map<string, number>> {
  const rows = await getDB()
    .prepare(
      `SELECT d.rate_plan AS rate_plan,
              IFNULL(SUM(IFNULL(a.allowance_mb, 0)), 0) AS allowance_mb
       FROM cc_devices d
       LEFT JOIN rate_plan_allowances a ON a.rate_plan = d.rate_plan
       WHERE d.rate_plan IS NOT NULL AND TRIM(d.rate_plan) != ''
       GROUP BY d.rate_plan`,
    )
    .all<{ rate_plan: string; allowance_mb: number }>();
  return new Map((rows.results ?? []).map((row) => [row.rate_plan, row.allowance_mb ?? 0]));
}

export async function listPoolRatePlanLatest(input?: {
  q?: string;
}): Promise<PoolRatePlanLatest[]> {
  const q = input?.q?.trim() ?? "";
  const [rows, liveAllowances] = await Promise.all([
    getDB()
      .prepare(
        `SELECT p.rate_plan, p.day, p.ctd_usage_mb, p.allowance_mb, p.sim_count, p.snapshotted_at
         FROM pool_rate_plan_daily p
         INNER JOIN (
           SELECT rate_plan, MAX(day) AS day FROM pool_rate_plan_daily GROUP BY rate_plan
         ) latest ON latest.rate_plan = p.rate_plan AND latest.day = p.day
         WHERE (? = '' OR p.rate_plan LIKE ?)
         ORDER BY p.rate_plan COLLATE NOCASE
         LIMIT 500`,
      )
      .bind(q, `%${q}%`)
      .all<{
        rate_plan: string;
        day: string;
        ctd_usage_mb: number;
        allowance_mb: number;
        sim_count: number;
        snapshotted_at: string;
      }>(),
    sumLivePoolAllowancesByRatePlan(),
  ]);

  return (rows.results ?? []).map((row) => {
    const allowanceMb = liveAllowances.get(row.rate_plan) ?? row.allowance_mb ?? 0;
    const ctdUsageMb = row.ctd_usage_mb ?? 0;
    return {
      ratePlan: row.rate_plan,
      day: row.day,
      ctdUsageMb,
      allowanceMb,
      simCount: row.sim_count,
      snapshottedAt: row.snapshotted_at,
      pct: allowanceMb > 0 ? Math.round((ctdUsageMb / allowanceMb) * 100) : 0,
    };
  });
}

export async function listPoolRatePlanSeries(input: {
  ratePlans?: string[];
  fromDay?: string;
  toDay?: string;
  limit?: number;
}): Promise<PoolRatePlanDay[]> {
  const plans = (input.ratePlans ?? []).map((p) => p.trim()).filter(Boolean);
  const fromDay = input.fromDay?.trim() || sydneyDayKeyDaysAgo(POOL_SERIES_DEFAULT_DAYS - 1);
  const toDay = input.toDay?.trim() || sydneyDayKey();
  const limit = Math.min(Math.max(input.limit ?? 2000, 1), 5000);
  const liveAllowances = await sumLivePoolAllowancesByRatePlan();

  const mapRow = (row: {
    rate_plan: string;
    day: string;
    ctd_usage_mb: number;
    allowance_mb: number;
    sim_count: number;
    snapshotted_at: string;
  }): PoolRatePlanDay => ({
    ratePlan: row.rate_plan,
    day: row.day,
    ctdUsageMb: row.ctd_usage_mb,
    allowanceMb: liveAllowances.get(row.rate_plan) ?? row.allowance_mb ?? 0,
    simCount: row.sim_count,
    snapshottedAt: row.snapshotted_at,
  });

  if (plans.length === 0) {
    const rows = await getDB()
      .prepare(
        `SELECT rate_plan, day, ctd_usage_mb, allowance_mb, sim_count, snapshotted_at
         FROM pool_rate_plan_daily
         WHERE (? = '' OR day >= ?)
           AND (? = '' OR day <= ?)
         ORDER BY day ASC, rate_plan COLLATE NOCASE
         LIMIT ?`,
      )
      .bind(fromDay, fromDay, toDay, toDay, limit)
      .all<{
        rate_plan: string;
        day: string;
        ctd_usage_mb: number;
        allowance_mb: number;
        sim_count: number;
        snapshotted_at: string;
      }>();
    return (rows.results ?? []).map(mapRow);
  }

  const placeholders = plans.map(() => "?").join(", ");
  const rows = await getDB()
    .prepare(
      `SELECT rate_plan, day, ctd_usage_mb, allowance_mb, sim_count, snapshotted_at
       FROM pool_rate_plan_daily
       WHERE rate_plan IN (${placeholders})
         AND (? = '' OR day >= ?)
         AND (? = '' OR day <= ?)
       ORDER BY day ASC, rate_plan COLLATE NOCASE
       LIMIT ?`,
    )
    .bind(...plans, fromDay, fromDay, toDay, toDay, limit)
    .all<{
      rate_plan: string;
      day: string;
      ctd_usage_mb: number;
      allowance_mb: number;
      sim_count: number;
      snapshotted_at: string;
    }>();
  return (rows.results ?? []).map(mapRow);
}

export function toPoolEntityFromCustomer(row: PoolCustomerLatest): PoolEntityLatest {
  return {
    name: row.customer,
    day: row.day,
    ctdUsageMb: row.ctdUsageMb,
    allowanceMb: row.allowanceMb,
    modemCount: row.modemCount,
    simCount: row.simCount,
    pct: row.pct,
  };
}

export function toPoolEntityFromRatePlan(row: PoolRatePlanLatest): PoolEntityLatest {
  return {
    name: row.ratePlan,
    day: row.day,
    ctdUsageMb: row.ctdUsageMb,
    allowanceMb: row.allowanceMb,
    modemCount: 0,
    simCount: row.simCount,
    pct: row.pct,
  };
}

export function toPoolEntityFromModem(row: PoolModemLatest): PoolEntityLatest {
  return {
    name: row.modemId,
    day: row.day,
    ctdUsageMb: row.ctdUsageMb,
    allowanceMb: row.allowanceMb,
    modemCount: row.simCount,
    simCount: row.simCount,
    pct: row.pct,
    customer: row.customer,
  };
}

/** Live Σ modem allowance per modem_ID (mapped MB × each SIM with that ID). */
export async function sumLivePoolAllowancesByModem(input?: {
  exactCustomer?: string;
}): Promise<Map<string, number>> {
  if (input?.exactCustomer !== undefined && !input.exactCustomer.trim()) return new Map();
  const exact = input?.exactCustomer?.trim() ?? "";
  const rows = await getDB()
    .prepare(
      `SELECT d.modem_id AS modem_id,
              IFNULL(SUM(IFNULL(a.allowance_mb, 0)), 0) AS allowance_mb
       FROM cc_devices d
       LEFT JOIN modem_allowances a ON a.modem_id = d.modem_id
       WHERE d.modem_id IS NOT NULL AND TRIM(d.modem_id) != ''
         AND (? = '' OR IFNULL(d.customer, '') = ?)
       GROUP BY d.modem_id`,
    )
    .bind(exact, exact)
    .all<{ modem_id: string; allowance_mb: number }>();
  return new Map((rows.results ?? []).map((row) => [row.modem_id, row.allowance_mb ?? 0]));
}

export async function listPoolModemLatest(input?: {
  q?: string;
  /** Exact Jasper/CC customer (reseller scope). */
  exactCustomer?: string;
}): Promise<PoolModemLatest[]> {
  // undefined = unrestricted; "" = reseller unbound → empty.
  if (input?.exactCustomer !== undefined && !input.exactCustomer.trim()) return [];
  const exact = input?.exactCustomer?.trim() ?? "";
  const q = input?.q?.trim() ?? "";

  const [rows, liveAllowances] = await Promise.all([
    getDB()
      .prepare(
        `SELECT p.modem_id, p.customer, p.day, p.ctd_usage_mb, p.allowance_mb, p.sim_count, p.snapshotted_at
         FROM pool_modem_daily p
         INNER JOIN (
           SELECT modem_id, MAX(day) AS day FROM pool_modem_daily GROUP BY modem_id
         ) latest ON latest.modem_id = p.modem_id AND latest.day = p.day
         WHERE (? = '' OR IFNULL(p.customer, '') = ?)
           AND (? = '' OR p.modem_id LIKE ? OR IFNULL(p.customer, '') LIKE ?)
         ORDER BY p.modem_id COLLATE NOCASE
         LIMIT 2000`,
      )
      .bind(exact, exact, q, `%${q}%`, `%${q}%`)
      .all<{
        modem_id: string;
        customer: string | null;
        day: string;
        ctd_usage_mb: number;
        allowance_mb: number;
        sim_count: number;
        snapshotted_at: string;
      }>(),
    sumLivePoolAllowancesByModem({ exactCustomer: input?.exactCustomer }),
  ]);

  return (rows.results ?? []).map((row) => {
    const allowanceMb = liveAllowances.get(row.modem_id) ?? row.allowance_mb ?? 0;
    const ctdUsageMb = row.ctd_usage_mb ?? 0;
    return {
      modemId: row.modem_id,
      customer: row.customer,
      day: row.day,
      ctdUsageMb,
      allowanceMb,
      simCount: row.sim_count,
      snapshottedAt: row.snapshotted_at,
      pct: allowanceMb > 0 ? Math.round((ctdUsageMb / allowanceMb) * 100) : 0,
    };
  });
}

export async function listPoolModemSeries(input: {
  modemIds?: string[];
  exactCustomer?: string;
  fromDay?: string;
  toDay?: string;
  limit?: number;
}): Promise<PoolModemDay[]> {
  if (input.exactCustomer !== undefined && !input.exactCustomer.trim()) return [];
  const exact = input.exactCustomer?.trim() ?? "";
  const ids = (input.modemIds ?? []).map((id) => id.trim()).filter(Boolean);
  const fromDay = input.fromDay?.trim() || sydneyDayKeyDaysAgo(POOL_SERIES_DEFAULT_DAYS - 1);
  const toDay = input.toDay?.trim() || sydneyDayKey();
  const limit = Math.min(Math.max(input.limit ?? 2000, 1), 5000);
  const liveAllowances = await sumLivePoolAllowancesByModem({
    exactCustomer: input.exactCustomer,
  });

  const mapRow = (row: {
    modem_id: string;
    customer: string | null;
    day: string;
    ctd_usage_mb: number;
    allowance_mb: number;
    sim_count: number;
    snapshotted_at: string;
  }): PoolModemDay => ({
    modemId: row.modem_id,
    customer: row.customer,
    day: row.day,
    ctdUsageMb: row.ctd_usage_mb,
    allowanceMb: liveAllowances.get(row.modem_id) ?? row.allowance_mb ?? 0,
    simCount: row.sim_count,
    snapshottedAt: row.snapshotted_at,
  });

  if (ids.length === 0) {
    const rows = await getDB()
      .prepare(
        `SELECT modem_id, customer, day, ctd_usage_mb, allowance_mb, sim_count, snapshotted_at
         FROM pool_modem_daily
         WHERE (? = '' OR IFNULL(customer, '') = ?)
           AND (? = '' OR day >= ?)
           AND (? = '' OR day <= ?)
         ORDER BY day ASC, modem_id COLLATE NOCASE
         LIMIT ?`,
      )
      .bind(exact, exact, fromDay, fromDay, toDay, toDay, limit)
      .all<{
        modem_id: string;
        customer: string | null;
        day: string;
        ctd_usage_mb: number;
        allowance_mb: number;
        sim_count: number;
        snapshotted_at: string;
      }>();
    return (rows.results ?? []).map(mapRow);
  }

  const placeholders = ids.map(() => "?").join(", ");
  const rows = await getDB()
    .prepare(
      `SELECT modem_id, customer, day, ctd_usage_mb, allowance_mb, sim_count, snapshotted_at
       FROM pool_modem_daily
       WHERE modem_id IN (${placeholders})
         AND (? = '' OR IFNULL(customer, '') = ?)
         AND (? = '' OR day >= ?)
         AND (? = '' OR day <= ?)
       ORDER BY day ASC, modem_id COLLATE NOCASE
       LIMIT ?`,
    )
    .bind(...ids, exact, exact, fromDay, fromDay, toDay, toDay, limit)
    .all<{
      modem_id: string;
      customer: string | null;
      day: string;
      ctd_usage_mb: number;
      allowance_mb: number;
      sim_count: number;
      snapshotted_at: string;
    }>();
  return (rows.results ?? []).map(mapRow);
}
