import { getDB } from "@/lib/env";
import { sydneyDayKey } from "@/lib/portal/time";

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

/** Distinct modem_IDs from CC snapshot with optional manual allowance. */
export async function listModemAllowances(customerFilter = ""): Promise<ModemAllowanceRow[]> {
  const q = customerFilter.trim();
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
         AND (? = '' OR IFNULL(d.customer, '') LIKE ?)
       GROUP BY d.modem_id
       ORDER BY modem_id COLLATE NOCASE
       LIMIT 2000`,
    )
    .bind(q, `%${q}%`)
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
  if (!id) throw new Error("modem_ID is required.");
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
  if (!id) throw new Error("modem_ID is required.");
  await getDB().prepare("DELETE FROM modem_allowances WHERE modem_id = ?").bind(id).run();
}

/**
 * Snapshot per Jasper/CC customer for the Sydney day (upsert).
 * modem_ID and CTD are per SIM — sum across every device row for that customer:
 * - ctd_usage_mb = Σ CTD MB
 * - allowance_mb = Σ manual allowance(modem_ID) for each SIM (same modem_ID on N SIMs counts N times)
 * - modem_count = SIMs that have a non-empty modem_ID
 */
export async function snapshotPoolCustomerDaily(day = sydneyDayKey()): Promise<number> {
  const db = getDB();
  const deviceRows = await db
    .prepare(
      `SELECT customer, modem_id, IFNULL(ctd_usage_mb, 0) AS ctd_usage_mb
       FROM cc_devices
       WHERE customer IS NOT NULL AND TRIM(customer) != ''`,
    )
    .all<{ customer: string; modem_id: string | null; ctd_usage_mb: number }>();

  const allowanceRows = await db
    .prepare("SELECT modem_id, allowance_mb FROM modem_allowances")
    .all<{ modem_id: string; allowance_mb: number }>();
  const allowanceByModem = new Map(
    (allowanceRows.results ?? []).map((row) => [row.modem_id, row.allowance_mb]),
  );

  type Agg = {
    ctd: number;
    allowance: number;
    simCount: number;
    simsWithModem: number;
  };
  const byCustomer = new Map<string, Agg>();

  for (const row of deviceRows.results ?? []) {
    const customer = row.customer.trim();
    if (!customer) continue;
    let agg = byCustomer.get(customer);
    if (!agg) {
      agg = { ctd: 0, allowance: 0, simCount: 0, simsWithModem: 0 };
      byCustomer.set(customer, agg);
    }
    agg.ctd += row.ctd_usage_mb ?? 0;
    agg.simCount += 1;
    const modem = row.modem_id?.trim();
    if (modem) {
      agg.simsWithModem += 1;
      agg.allowance += allowanceByModem.get(modem) ?? 0;
    }
  }

  const now = new Date().toISOString();
  const statements = [];
  for (const [customer, agg] of byCustomer) {
    statements.push(
      db
        .prepare(
          `INSERT INTO pool_customer_daily
             (customer, day, ctd_usage_mb, allowance_mb, modem_count, sim_count, snapshotted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(customer, day) DO UPDATE SET
             ctd_usage_mb = excluded.ctd_usage_mb,
             allowance_mb = excluded.allowance_mb,
             modem_count = excluded.modem_count,
             sim_count = excluded.sim_count,
             snapshotted_at = excluded.snapshotted_at`,
        )
        .bind(customer, day, agg.ctd, agg.allowance, agg.simsWithModem, agg.simCount, now),
    );
  }

  for (let i = 0; i < statements.length; i += 40) {
    await db.batch(statements.slice(i, i + 40));
  }
  return byCustomer.size;
}

/** Run at most once per Sydney day from cron (cheap existence check). */
export async function snapshotPoolCustomerDailyIfNeeded(): Promise<number | null> {
  const day = sydneyDayKey();
  const existing = await getDB()
    .prepare("SELECT 1 AS ok FROM pool_customer_daily WHERE day = ? LIMIT 1")
    .bind(day)
    .first<{ ok: number }>();
  if (existing) return null;
  return snapshotPoolCustomerDaily(day);
}

export async function listPoolCustomerLatest(customerFilter = ""): Promise<PoolCustomerLatest[]> {
  const q = customerFilter.trim();
  const rows = await getDB()
    .prepare(
      `SELECT p.customer, p.day, p.ctd_usage_mb, p.allowance_mb, p.modem_count, p.sim_count, p.snapshotted_at
       FROM pool_customer_daily p
       INNER JOIN (
         SELECT customer, MAX(day) AS day FROM pool_customer_daily GROUP BY customer
       ) latest ON latest.customer = p.customer AND latest.day = p.day
       WHERE (? = '' OR p.customer LIKE ?)
       ORDER BY p.customer COLLATE NOCASE
       LIMIT 500`,
    )
    .bind(q, `%${q}%`)
    .all<{
      customer: string;
      day: string;
      ctd_usage_mb: number;
      allowance_mb: number;
      modem_count: number;
      sim_count: number;
      snapshotted_at: string;
    }>();

  return (rows.results ?? []).map((row) => {
    const allowanceMb = row.allowance_mb ?? 0;
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
  fromDay?: string;
  toDay?: string;
  limit?: number;
}): Promise<PoolCustomerDay[]> {
  const customer = input.customer?.trim() ?? "";
  const fromDay = input.fromDay?.trim() ?? "";
  const toDay = input.toDay?.trim() ?? "";
  const limit = Math.min(Math.max(input.limit ?? 90, 1), 366);
  const rows = await getDB()
    .prepare(
      `SELECT customer, day, ctd_usage_mb, allowance_mb, modem_count, sim_count, snapshotted_at
       FROM pool_customer_daily
       WHERE (? = '' OR customer = ?)
         AND (? = '' OR day >= ?)
         AND (? = '' OR day <= ?)
       ORDER BY day ASC, customer COLLATE NOCASE
       LIMIT ?`,
    )
    .bind(customer, customer, fromDay, fromDay, toDay, toDay, limit)
    .all<{
      customer: string;
      day: string;
      ctd_usage_mb: number;
      allowance_mb: number;
      modem_count: number;
      sim_count: number;
      snapshotted_at: string;
    }>();

  return (rows.results ?? []).map((row) => ({
    customer: row.customer,
    day: row.day,
    ctdUsageMb: row.ctd_usage_mb,
    allowanceMb: row.allowance_mb,
    modemCount: row.modem_count,
    simCount: row.sim_count,
    snapshottedAt: row.snapshotted_at,
  }));
}
