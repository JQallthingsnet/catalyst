import { getDB } from "@/lib/env";
import { portalTableHasColumn } from "@/lib/portal/d1-compat";
import { sumPoolTopupMbByModem, sumPoolTopupUnitsByModem } from "@/lib/portal/pool-topups";
import type { UsageAllowanceBasis } from "@/lib/portal/sim-usage";
import { sydneyDayKey, sydneyDayKeyDaysAgo } from "@/lib/portal/time";

/** Default chart window: daily points accumulate on the date axis. */
export const POOL_SERIES_DEFAULT_DAYS = 90;

export type ModemAllowanceRow = {
  modemId: string;
  /** Data MB. null = unset; 0 = PAYG. */
  allowanceMb: number | null;
  /** SMS messages. null = unset; 0 = PAYG. */
  allowanceSms: number | null;
  /** Voice minutes. null = unset; 0 = PAYG. */
  allowanceVoiceMin: number | null;
  customer: string | null;
  simCount: number;
  ctdUsageMb: number;
  ctdSms: number;
  ctdVoiceMin: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type PoolCustomerDay = {
  customer: string;
  day: string;
  ctdUsageMb: number;
  ctdSms: number;
  ctdVoiceMin: number;
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
  ctdSms: number;
  ctdVoiceMin: number;
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
  ctdSms: number;
  ctdVoiceMin: number;
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
  ctdSms: number;
  ctdVoiceMin: number;
  /** Pool total data allowance (Σ per-SIM × SIMs + current-month top-ups). */
  allowanceMb: number;
  modemCount: number;
  simCount: number;
  pct: number;
  /** CC customer when grouping by modem_ID. */
  customer?: string | null;
  /** Per-SIM data allowance from modem_allowances (Reseller Plan). */
  perSimAllowanceMb?: number | null;
  /** Current Sydney-month top-up SIM units for this plan. */
  topupSimUnits?: number;
  /** Current Sydney-month top-up MB for this plan. */
  topupAllowanceMb?: number;
  /** Contract unit price AUD for this Reseller Plan (reseller top-up). */
  unitPriceAud?: number | null;
};

/**
 * Reseller Plan allowance editor keys:
 * - every plan on a reseller Contract (tenant_plan_assignments)
 * - plus every Catalyst Reseller Plan currently on CC/SIM stock for the scope
 * Allowance values live in `modem_allowances.modem_id` (= Reseller Plan name).
 *
 * First sync mirrors CC modem_ID → Catalyst Reseller Plan; pools/allowances then
 * follow that Reseller Plan (not raw modem_ID after Catalyst changes it).
 */
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
      `WITH plan_keys AS (
         SELECT DISTINCT p.id AS platform_plan_id, TRIM(p.name) AS modem_id
         FROM platform_plans p
         JOIN tenant_plan_assignments a ON a.platform_plan_id = p.id
         WHERE IFNULL(p.active, 1) = 1 AND TRIM(IFNULL(p.name, '')) != ''
         UNION
         SELECT DISTINCT p.id AS platform_plan_id, TRIM(p.name) AS modem_id
         FROM cc_devices d
         JOIN platform_plans p ON p.id = COALESCE(
           NULLIF(TRIM(d.platform_plan_id), ''),
           (SELECT s.platform_plan_id FROM sims s
             WHERE s.iccid = d.iccid
               AND s.platform_plan_id IS NOT NULL
               AND TRIM(s.platform_plan_id) != ''
             LIMIT 1)
         )
         WHERE TRIM(IFNULL(p.name, '')) != ''
           AND (? = '' OR IFNULL(d.customer, '') = ?)
       )
       SELECT k.modem_id,
              (SELECT MAX(d.customer)
                 FROM cc_devices d
                WHERE COALESCE(
                        NULLIF(TRIM(d.platform_plan_id), ''),
                        (SELECT s.platform_plan_id FROM sims s
                          WHERE s.iccid = d.iccid
                            AND s.platform_plan_id IS NOT NULL
                            AND TRIM(s.platform_plan_id) != ''
                          LIMIT 1)
                      ) = k.platform_plan_id
                  AND (? = '' OR IFNULL(d.customer, '') = ?)
              ) AS customer,
              (SELECT COUNT(*)
                 FROM cc_devices d
                WHERE COALESCE(
                        NULLIF(TRIM(d.platform_plan_id), ''),
                        (SELECT s.platform_plan_id FROM sims s
                          WHERE s.iccid = d.iccid
                            AND s.platform_plan_id IS NOT NULL
                            AND TRIM(s.platform_plan_id) != ''
                          LIMIT 1)
                      ) = k.platform_plan_id
                  AND (? = '' OR IFNULL(d.customer, '') = ?)
              ) AS sim_count,
              (SELECT IFNULL(SUM(d.ctd_usage_mb), 0)
                 FROM cc_devices d
                WHERE COALESCE(
                        NULLIF(TRIM(d.platform_plan_id), ''),
                        (SELECT s.platform_plan_id FROM sims s
                          WHERE s.iccid = d.iccid
                            AND s.platform_plan_id IS NOT NULL
                            AND TRIM(s.platform_plan_id) != ''
                          LIMIT 1)
                      ) = k.platform_plan_id
                  AND (? = '' OR IFNULL(d.customer, '') = ?)
              ) AS ctd_usage_mb,
              (SELECT IFNULL(SUM(d.ctd_sms), 0)
                 FROM cc_devices d
                WHERE COALESCE(
                        NULLIF(TRIM(d.platform_plan_id), ''),
                        (SELECT s.platform_plan_id FROM sims s
                          WHERE s.iccid = d.iccid
                            AND s.platform_plan_id IS NOT NULL
                            AND TRIM(s.platform_plan_id) != ''
                          LIMIT 1)
                      ) = k.platform_plan_id
                  AND (? = '' OR IFNULL(d.customer, '') = ?)
              ) AS ctd_sms,
              (SELECT IFNULL(SUM(d.ctd_voice_min), 0)
                 FROM cc_devices d
                WHERE COALESCE(
                        NULLIF(TRIM(d.platform_plan_id), ''),
                        (SELECT s.platform_plan_id FROM sims s
                          WHERE s.iccid = d.iccid
                            AND s.platform_plan_id IS NOT NULL
                            AND TRIM(s.platform_plan_id) != ''
                          LIMIT 1)
                      ) = k.platform_plan_id
                  AND (? = '' OR IFNULL(d.customer, '') = ?)
              ) AS ctd_voice_min,
              a.allowance_mb AS allowance_mb,
              ${await modemAllowanceSmsExpr()} AS allowance_sms,
              ${await modemAllowanceVoiceExpr()} AS allowance_voice_min,
              a.updated_at AS updated_at,
              a.updated_by AS updated_by
       FROM plan_keys k
       LEFT JOIN modem_allowances a ON a.modem_id = k.modem_id
       WHERE (? = '' OR k.modem_id LIKE ?)
       ORDER BY k.modem_id COLLATE NOCASE
       LIMIT 2000`,
    )
    .bind(
      exact,
      exact,
      exact,
      exact,
      exact,
      exact,
      exact,
      exact,
      exact,
      exact,
      exact,
      exact,
      q,
      `%${q}%`,
    )
    .all<{
      modem_id: string;
      customer: string | null;
      sim_count: number;
      ctd_usage_mb: number;
      ctd_sms: number;
      ctd_voice_min: number;
      allowance_mb: number | null;
      allowance_sms: number | null;
      allowance_voice_min: number | null;
      updated_at: string | null;
      updated_by: string | null;
    }>();

  return (rows.results ?? []).map((row) => ({
    modemId: row.modem_id,
    allowanceMb: row.allowance_mb,
    allowanceSms: row.allowance_sms,
    allowanceVoiceMin: row.allowance_voice_min,
    customer: row.customer,
    simCount: row.sim_count,
    ctdUsageMb: row.ctd_usage_mb,
    ctdSms: row.ctd_sms ?? 0,
    ctdVoiceMin: row.ctd_voice_min ?? 0,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

async function modemAllowanceSmsExpr(): Promise<string> {
  return (await portalTableHasColumn("modem_allowances", "allowance_sms"))
    ? "a.allowance_sms"
    : "NULL";
}

async function modemAllowanceVoiceExpr(): Promise<string> {
  return (await portalTableHasColumn("modem_allowances", "allowance_voice_min"))
    ? "a.allowance_voice_min"
    : "NULL";
}

/**
 * Upsert Reseller Plan allowances. null clears that channel; 0 = PAYG.
 * If data, SMS, and voice are all null, the row is removed.
 */
export async function setModemAllowance(
  modemId: string,
  input: {
    allowanceMb: number | null;
    allowanceSms: number | null;
    allowanceVoiceMin: number | null;
  },
  actorEmail: string,
): Promise<void> {
  const id = modemId.trim();
  if (!id) throw new Error("Reseller Plan is required.");
  const mb = input.allowanceMb == null ? null : parseNonNegAllowance(Number(input.allowanceMb), "Data allowance");
  const sms =
    input.allowanceSms == null ? null : parseNonNegAllowance(Number(input.allowanceSms), "SMS allowance");
  const voice =
    input.allowanceVoiceMin == null
      ? null
      : parseNonNegAllowance(Number(input.allowanceVoiceMin), "Voice allowance");

  if (mb == null && sms == null && voice == null) {
    await clearModemAllowance(id);
    return;
  }

  const now = new Date().toISOString();
  const mbStored = mb ?? 0;
  const hasSms = await portalTableHasColumn("modem_allowances", "allowance_sms");
  const hasVoice = await portalTableHasColumn("modem_allowances", "allowance_voice_min");
  if (hasSms && hasVoice) {
    await getDB()
      .prepare(
        `INSERT INTO modem_allowances
           (modem_id, allowance_mb, allowance_sms, allowance_voice_min, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(modem_id) DO UPDATE SET
           allowance_mb = excluded.allowance_mb,
           allowance_sms = excluded.allowance_sms,
           allowance_voice_min = excluded.allowance_voice_min,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`,
      )
      .bind(id, mbStored, sms, voice, now, actorEmail)
      .run();
    return;
  }
  await getDB()
    .prepare(
      `INSERT INTO modem_allowances (modem_id, allowance_mb, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(modem_id) DO UPDATE SET
         allowance_mb = excluded.allowance_mb,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .bind(id, mbStored, now, actorEmail)
    .run();
}

export async function clearModemAllowance(modemId: string): Promise<void> {
  const id = modemId.trim();
  if (!id) throw new Error("Reseller Plan is required.");
  await getDB().prepare("DELETE FROM modem_allowances WHERE modem_id = ?").bind(id).run();
}

export type RatePlanAllowanceRow = {
  ratePlan: string;
  /** Data MB. null = unset; 0 = PAYG. */
  allowanceMb: number | null;
  /** SMS messages. null = unset; 0 = PAYG. */
  allowanceSms: number | null;
  /** Voice minutes. null = unset; 0 = PAYG. */
  allowanceVoiceMin: number | null;
  simCount: number;
  ctdUsageMb: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

function parseNonNegAllowance(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number (0 = PAYG).`);
  }
  return value;
}

/** Distinct Jasper/CC rate plans with optional manual allowance (super-admin Usage). */
export async function listRatePlanAllowances(): Promise<RatePlanAllowanceRow[]> {
  const hasSms = await portalTableHasColumn("rate_plan_allowances", "allowance_sms");
  const hasVoice = await portalTableHasColumn("rate_plan_allowances", "allowance_voice_min");
  const smsExpr = hasSms ? "a.allowance_sms" : "NULL";
  const voiceExpr = hasVoice ? "a.allowance_voice_min" : "NULL";
  const rows = await getDB()
    .prepare(
      `SELECT d.rate_plan AS rate_plan,
              COUNT(*) AS sim_count,
              IFNULL(SUM(d.ctd_usage_mb), 0) AS ctd_usage_mb,
              a.allowance_mb AS allowance_mb,
              ${smsExpr} AS allowance_sms,
              ${voiceExpr} AS allowance_voice_min,
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
      allowance_sms: number | null;
      allowance_voice_min: number | null;
      updated_at: string | null;
      updated_by: string | null;
    }>();

  return (rows.results ?? []).map((row) => ({
    ratePlan: row.rate_plan,
    allowanceMb: row.allowance_mb,
    allowanceSms: row.allowance_sms,
    allowanceVoiceMin: row.allowance_voice_min,
    simCount: row.sim_count,
    ctdUsageMb: row.ctd_usage_mb,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

/**
 * Upsert Supplier code allowances. null clears that channel; 0 = PAYG.
 * If data, SMS, and voice are all null, the row is removed.
 */
export async function setRatePlanAllowance(
  ratePlan: string,
  input: {
    allowanceMb: number | null;
    allowanceSms: number | null;
    allowanceVoiceMin: number | null;
  },
  actorEmail: string,
): Promise<void> {
  const id = ratePlan.trim();
  if (!id) throw new Error("Rate plan is required.");
  const mb = input.allowanceMb == null ? null : parseNonNegAllowance(Number(input.allowanceMb), "Data allowance");
  const sms =
    input.allowanceSms == null ? null : parseNonNegAllowance(Number(input.allowanceSms), "SMS allowance");
  const voice =
    input.allowanceVoiceMin == null
      ? null
      : parseNonNegAllowance(Number(input.allowanceVoiceMin), "Voice allowance");

  if (mb == null && sms == null && voice == null) {
    await clearRatePlanAllowance(id);
    return;
  }

  const now = new Date().toISOString();
  // allowance_mb is NOT NULL in the original table — store 0 (PAYG) when only SMS/voice are set.
  const mbStored = mb ?? 0;
  const hasSms = await portalTableHasColumn("rate_plan_allowances", "allowance_sms");
  const hasVoice = await portalTableHasColumn("rate_plan_allowances", "allowance_voice_min");
  if (hasSms && hasVoice) {
    await getDB()
      .prepare(
        `INSERT INTO rate_plan_allowances
           (rate_plan, allowance_mb, allowance_sms, allowance_voice_min, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(rate_plan) DO UPDATE SET
           allowance_mb = excluded.allowance_mb,
           allowance_sms = excluded.allowance_sms,
           allowance_voice_min = excluded.allowance_voice_min,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`,
      )
      .bind(id, mbStored, sms, voice, now, actorEmail)
      .run();
    return;
  }
  await getDB()
    .prepare(
      `INSERT INTO rate_plan_allowances (rate_plan, allowance_mb, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(rate_plan) DO UPDATE SET
         allowance_mb = excluded.allowance_mb,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .bind(id, mbStored, now, actorEmail)
    .run();
}

export async function clearRatePlanAllowance(ratePlan: string): Promise<void> {
  const id = ratePlan.trim();
  if (!id) throw new Error("Rate plan is required.");
  await getDB().prepare("DELETE FROM rate_plan_allowances WHERE rate_plan = ?").bind(id).run();
}

/**
 * Snapshot for the Sydney day (upsert).
 * - pool_rate_plan_daily: super-admin Pools (group by Supplier code / Jasper rate plan)
 * - pool_modem_daily: reseller Pools (group by Catalyst Reseller Plan)
 * - pool_customer_daily: kept for history / rollups
 * Full run writes all. Scoped reseller snapshot updates customer + modem rows only.
 *
 * Reseller Plan originates as CC modem_ID on first sync, then lives on
 * sims/cc_devices.platform_plan_id — pools always group by that Reseller Plan.
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
  // Catalyst Reseller Plan name: prefer sims.platform_plan_id (SIMs page source of truth),
  // else CC platform_plan_id. First sync mirrors modem_ID → Reseller Plan on sims.
  const deviceRows = await db
    .prepare(
      `SELECT d.customer AS customer,
              d.rate_plan AS rate_plan,
              IFNULL(d.ctd_usage_mb, 0) AS ctd_usage_mb,
              IFNULL(d.ctd_sms, 0) AS ctd_sms,
              IFNULL(d.ctd_voice_min, 0) AS ctd_voice_min,
              NULLIF(TRIM(COALESCE(spp.name, pp.name)), '') AS plan_name
       FROM cc_devices d
       LEFT JOIN platform_plans pp ON pp.id = d.platform_plan_id
       LEFT JOIN sims s ON s.iccid = d.iccid
       LEFT JOIN platform_plans spp ON spp.id = s.platform_plan_id
       WHERE (d.customer IS NOT NULL AND TRIM(d.customer) != '')
          OR (d.rate_plan IS NOT NULL AND TRIM(d.rate_plan) != '')
          OR (d.platform_plan_id IS NOT NULL AND TRIM(d.platform_plan_id) != '')
          OR (s.platform_plan_id IS NOT NULL AND TRIM(s.platform_plan_id) != '')`,
    )
    .all<{
      customer: string | null;
      rate_plan: string | null;
      ctd_usage_mb: number;
      ctd_sms: number;
      ctd_voice_min: number;
      plan_name: string | null;
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
    sms: number;
    voice: number;
    modemAllowance: number;
    ratePlanAllowance: number;
    simCount: number;
    simsWithModem: number;
  };
  type RatePlanAgg = { ctd: number; sms: number; voice: number; allowance: number; simCount: number };
  type ModemAgg = {
    ctd: number;
    sms: number;
    voice: number;
    allowance: number;
    simCount: number;
    customer: string | null;
  };
  const byCustomer = new Map<string, CustomerAgg>();
  const byRatePlan = new Map<string, RatePlanAgg>();
  const byModem = new Map<string, ModemAgg>();

  for (const row of deviceRows.results ?? []) {
    const ctd = row.ctd_usage_mb ?? 0;
    const sms = row.ctd_sms ?? 0;
    const voice = row.ctd_voice_min ?? 0;
    const customer = row.customer?.trim() ?? "";
    const inCustomerScope = !only || (customer !== "" && only.includes(customer.toLowerCase()));
    const planName = row.plan_name?.trim() ?? "";

    if (customer && inCustomerScope) {
      let agg = byCustomer.get(customer);
      if (!agg) {
        agg = {
          ctd: 0,
          sms: 0,
          voice: 0,
          modemAllowance: 0,
          ratePlanAllowance: 0,
          simCount: 0,
          simsWithModem: 0,
        };
        byCustomer.set(customer, agg);
      }
      agg.ctd += ctd;
      agg.sms += sms;
      agg.voice += voice;
      agg.simCount += 1;
      if (planName) {
        agg.simsWithModem += 1;
        agg.modemAllowance += allowanceByModem.get(planName) ?? 0;
      }
      const rp = row.rate_plan?.trim();
      if (rp) agg.ratePlanAllowance += allowanceByRatePlan.get(rp) ?? 0;
    }

    if (writeRatePlans) {
      const ratePlan = row.rate_plan?.trim() ?? "";
      if (ratePlan) {
        let agg = byRatePlan.get(ratePlan);
        if (!agg) {
          agg = { ctd: 0, sms: 0, voice: 0, allowance: 0, simCount: 0 };
          byRatePlan.set(ratePlan, agg);
        }
        agg.ctd += ctd;
        agg.sms += sms;
        agg.voice += voice;
        agg.simCount += 1;
        agg.allowance += allowanceByRatePlan.get(ratePlan) ?? 0;
      }
    }

    if (inCustomerScope && planName) {
      let agg = byModem.get(planName);
      if (!agg) {
        agg = { ctd: 0, sms: 0, voice: 0, allowance: 0, simCount: 0, customer: customer || null };
        byModem.set(planName, agg);
      }
      agg.ctd += ctd;
      agg.sms += sms;
      agg.voice += voice;
      agg.simCount += 1;
      // Per-SIM application: same Reseller Plan on N SIMs counts N times.
      agg.allowance += allowanceByModem.get(planName) ?? 0;
      if (customer) agg.customer = customer;
    }
  }

  const now = new Date().toISOString();
  const statements = [];
  for (const [customer, agg] of byCustomer) {
    statements.push(
      db
        .prepare(
          `INSERT INTO pool_customer_daily
             (customer, day, ctd_usage_mb, ctd_sms, ctd_voice_min, allowance_mb, rate_plan_allowance_mb,
              modem_count, sim_count, snapshotted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(customer, day) DO UPDATE SET
             ctd_usage_mb = excluded.ctd_usage_mb,
             ctd_sms = excluded.ctd_sms,
             ctd_voice_min = excluded.ctd_voice_min,
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
          agg.sms,
          agg.voice,
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
             (rate_plan, day, ctd_usage_mb, ctd_sms, ctd_voice_min, allowance_mb, sim_count, snapshotted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(rate_plan, day) DO UPDATE SET
             ctd_usage_mb = excluded.ctd_usage_mb,
             ctd_sms = excluded.ctd_sms,
             ctd_voice_min = excluded.ctd_voice_min,
             allowance_mb = excluded.allowance_mb,
             sim_count = excluded.sim_count,
             snapshotted_at = excluded.snapshotted_at`,
        )
        .bind(ratePlan, day, agg.ctd, agg.sms, agg.voice, agg.allowance, agg.simCount, now),
    );
  }
  for (const [modemId, agg] of byModem) {
    statements.push(
      db
        .prepare(
          `INSERT INTO pool_modem_daily
             (modem_id, day, customer, ctd_usage_mb, ctd_sms, ctd_voice_min, allowance_mb, sim_count, snapshotted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(modem_id, day) DO UPDATE SET
             customer = excluded.customer,
             ctd_usage_mb = excluded.ctd_usage_mb,
             ctd_sms = excluded.ctd_sms,
             ctd_voice_min = excluded.ctd_voice_min,
             allowance_mb = excluded.allowance_mb,
             sim_count = excluded.sim_count,
             snapshotted_at = excluded.snapshotted_at`,
        )
        .bind(modemId, day, agg.customer, agg.ctd, agg.sms, agg.voice, agg.allowance, agg.simCount, now),
    );
  }

  for (let i = 0; i < statements.length; i += 40) {
    await db.batch(statements.slice(i, i + 40));
  }
  if (writeRatePlans) return byRatePlan.size;
  return byModem.size;
}

/** Copy warehouse Reseller Plan onto CC rows that still lack platform_plan_id. */
async function backfillCcDevicePlatformPlansFromSims(): Promise<void> {
  await getDB()
    .prepare(
      `UPDATE cc_devices
       SET platform_plan_id = (
         SELECT s.platform_plan_id
         FROM sims s
         WHERE s.iccid = cc_devices.iccid
           AND s.platform_plan_id IS NOT NULL
           AND TRIM(s.platform_plan_id) != ''
         LIMIT 1
       )
       WHERE (platform_plan_id IS NULL OR TRIM(platform_plan_id) = '')
         AND EXISTS (
           SELECT 1 FROM sims s
           WHERE s.iccid = cc_devices.iccid
             AND s.platform_plan_id IS NOT NULL
             AND TRIM(s.platform_plan_id) != ''
         )`,
    )
    .run();
}

/**
 * Upsert today’s pool aggregates (idempotent).
 * Always refreshes so a Reseller Plan newly visible on SIMs appears in Pools the same Sydney day
 * (previously skipped after the first daily write).
 */
export async function snapshotPoolCustomerDailyIfNeeded(): Promise<number | null> {
  const day = sydneyDayKey();
  try {
    await backfillCcDevicePlatformPlansFromSims();
  } catch {
    // Column may not exist until migration 0038 is applied.
  }
  try {
    const { snapshotSimPlatformPlanDaily } = await import("@/lib/portal/sim-platform-plan-daily");
    await snapshotSimPlatformPlanDaily(day);
  } catch {
    // Table may not exist until migration 0039 is applied.
  }
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
        `SELECT p.customer, p.day, p.ctd_usage_mb, IFNULL(p.ctd_sms, 0) AS ctd_sms,
                IFNULL(p.ctd_voice_min, 0) AS ctd_voice_min,
                p.allowance_mb, p.rate_plan_allowance_mb,
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
        ctd_sms: number;
        ctd_voice_min: number;
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
      ctdSms: row.ctd_sms ?? 0,
      ctdVoiceMin: row.ctd_voice_min ?? 0,
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
        `SELECT customer, day, ctd_usage_mb, IFNULL(ctd_sms, 0) AS ctd_sms,
                IFNULL(ctd_voice_min, 0) AS ctd_voice_min,
                allowance_mb, rate_plan_allowance_mb,
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
        ctd_sms: number;
        ctd_voice_min: number;
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
      `SELECT customer, day, ctd_usage_mb, IFNULL(ctd_sms, 0) AS ctd_sms,
              IFNULL(ctd_voice_min, 0) AS ctd_voice_min,
              allowance_mb, rate_plan_allowance_mb,
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
      ctd_sms: number;
      ctd_voice_min: number;
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
    ctd_sms: number;
    ctd_voice_min: number;
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
    ctdSms: row.ctd_sms ?? 0,
    ctdVoiceMin: row.ctd_voice_min ?? 0,
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
        `SELECT p.rate_plan, p.day, p.ctd_usage_mb, IFNULL(p.ctd_sms, 0) AS ctd_sms,
                IFNULL(p.ctd_voice_min, 0) AS ctd_voice_min, p.allowance_mb, p.sim_count, p.snapshotted_at
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
        ctd_sms: number;
        ctd_voice_min: number;
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
      ctdSms: row.ctd_sms ?? 0,
      ctdVoiceMin: row.ctd_voice_min ?? 0,
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
    ctd_sms: number;
    ctd_voice_min: number;
    allowance_mb: number;
    sim_count: number;
    snapshotted_at: string;
  }): PoolRatePlanDay => ({
    ratePlan: row.rate_plan,
    day: row.day,
    ctdUsageMb: row.ctd_usage_mb,
    ctdSms: row.ctd_sms ?? 0,
    ctdVoiceMin: row.ctd_voice_min ?? 0,
    allowanceMb: liveAllowances.get(row.rate_plan) ?? row.allowance_mb ?? 0,
    simCount: row.sim_count,
    snapshottedAt: row.snapshotted_at,
  });

  if (plans.length === 0) {
    const rows = await getDB()
      .prepare(
        `SELECT rate_plan, day, ctd_usage_mb, IFNULL(ctd_sms, 0) AS ctd_sms,
                IFNULL(ctd_voice_min, 0) AS ctd_voice_min, allowance_mb, sim_count, snapshotted_at
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
        ctd_sms: number;
        ctd_voice_min: number;
        allowance_mb: number;
        sim_count: number;
        snapshotted_at: string;
      }>();
    return (rows.results ?? []).map(mapRow);
  }

  const placeholders = plans.map(() => "?").join(", ");
  const rows = await getDB()
    .prepare(
      `SELECT rate_plan, day, ctd_usage_mb, IFNULL(ctd_sms, 0) AS ctd_sms,
              IFNULL(ctd_voice_min, 0) AS ctd_voice_min, allowance_mb, sim_count, snapshotted_at
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
      ctd_sms: number;
      ctd_voice_min: number;
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
    ctdSms: row.ctdSms,
    ctdVoiceMin: row.ctdVoiceMin,
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
    ctdSms: row.ctdSms,
    ctdVoiceMin: row.ctdVoiceMin,
    allowanceMb: row.allowanceMb,
    modemCount: 0,
    simCount: row.simCount,
    pct: row.pct,
  };
}

export function toPoolEntityFromModem(
  row: PoolModemLatest & {
    perSimAllowanceMb?: number | null;
    topupSimUnits?: number;
    topupAllowanceMb?: number;
    unitPriceAud?: number | null;
  },
): PoolEntityLatest {
  return {
    name: row.modemId,
    day: row.day,
    ctdUsageMb: row.ctdUsageMb,
    ctdSms: row.ctdSms,
    ctdVoiceMin: row.ctdVoiceMin,
    allowanceMb: row.allowanceMb,
    modemCount: row.simCount,
    simCount: row.simCount,
    pct: row.pct,
    customer: row.customer,
    perSimAllowanceMb: row.perSimAllowanceMb,
    topupSimUnits: row.topupSimUnits,
    topupAllowanceMb: row.topupAllowanceMb,
    unitPriceAud: row.unitPriceAud,
  };
}

/** Live Σ Reseller Plan allowance (mapped MB × each SIM on that Catalyst plan + month top-ups). */
export async function sumLivePoolAllowancesByModem(input?: {
  exactCustomer?: string;
  /** Reseller org — group from sims.platform_plan_id (same as SIMs page). */
  tenantId?: string;
}): Promise<Map<string, number>> {
  if (input?.exactCustomer !== undefined && !input.exactCustomer.trim()) return new Map();
  const tenantId = input?.tenantId?.trim() ?? "";
  if (tenantId) {
    const rows = await getDB()
      .prepare(
        `SELECT TRIM(pp.name) AS modem_id,
                IFNULL(SUM(IFNULL(a.allowance_mb, 0)), 0) AS allowance_mb
         FROM sims s
         JOIN platform_plans pp ON pp.id = s.platform_plan_id
         LEFT JOIN modem_allowances a ON a.modem_id = TRIM(pp.name)
         WHERE s.tenant_id = ?
           AND s.platform_plan_id IS NOT NULL AND TRIM(s.platform_plan_id) != ''
           AND TRIM(IFNULL(pp.name, '')) != ''
         GROUP BY TRIM(pp.name)`,
      )
      .bind(tenantId)
      .all<{ modem_id: string; allowance_mb: number }>();
    const base = new Map((rows.results ?? []).map((row) => [row.modem_id, row.allowance_mb ?? 0]));
    const topups = await sumPoolTopupMbByModem({ tenantId });
    for (const [modemId, mb] of topups) {
      base.set(modemId, (base.get(modemId) ?? 0) + mb);
    }
    return base;
  }

  const exact = input?.exactCustomer?.trim() ?? "";
  const rows = await getDB()
    .prepare(
      `SELECT TRIM(COALESCE(pp.name, spp.name)) AS modem_id,
              IFNULL(SUM(IFNULL(a.allowance_mb, 0)), 0) AS allowance_mb
       FROM cc_devices d
       LEFT JOIN platform_plans pp ON pp.id = d.platform_plan_id
       LEFT JOIN sims s ON s.iccid = d.iccid
       LEFT JOIN platform_plans spp ON spp.id = s.platform_plan_id
       LEFT JOIN modem_allowances a
         ON a.modem_id = TRIM(COALESCE(pp.name, spp.name))
       WHERE TRIM(COALESCE(pp.name, spp.name, '')) != ''
         AND (? = '' OR IFNULL(d.customer, '') = ?)
       GROUP BY TRIM(COALESCE(pp.name, spp.name))`,
    )
    .bind(exact, exact)
    .all<{ modem_id: string; allowance_mb: number }>();
  return new Map((rows.results ?? []).map((row) => [row.modem_id, row.allowance_mb ?? 0]));
}

export async function listPoolModemLatest(input?: {
  q?: string;
  /** Exact Jasper/CC customer (reseller scope). */
  exactCustomer?: string;
  /** Reseller org — required so grouping matches SIMs (sims.platform_plan_id). */
  tenantId?: string;
}): Promise<
  Array<
    PoolModemLatest & {
      perSimAllowanceMb: number | null;
      topupSimUnits: number;
      topupAllowanceMb: number;
      unitPriceAud: number | null;
    }
  >
> {
  // undefined = unrestricted; "" = reseller unbound → empty.
  if (input?.exactCustomer !== undefined && !input.exactCustomer.trim()) return [];
  const exact = input?.exactCustomer?.trim() ?? "";
  const q = input?.q?.trim() ?? "";
  const day = sydneyDayKey();
  const tenantId = input?.tenantId?.trim() ?? "";

  // Same source as SIMs Reseller Plan column: sims.platform_plan_id → platform_plans.name.
  const live = await listLivePoolModemLatest({
    q,
    exactCustomer: input?.exactCustomer,
    tenantId: input?.tenantId,
  });
  const topupMb = tenantId ? await sumPoolTopupMbByModem({ tenantId }) : new Map<string, number>();
  const topupUnits = tenantId ? await sumPoolTopupUnitsByModem({ tenantId }) : new Map<string, number>();
  const unitPrices = tenantId ? await unitPricesByModemName(tenantId) : new Map<string, number>();

  return live.map((row) => {
    const perSim = row.allowanceMb;
    // Pool total: per-SIM × SIMs (+ current-month top-ups). PAYG/unset → 0 base.
    const baseMb = (perSim != null ? perSim : 0) * (row.simCount || 0);
    const extraMb = topupMb.get(row.modemId) ?? 0;
    const allowanceMb = baseMb + extraMb;
    const ctdUsageMb = row.ctdUsageMb ?? 0;
    return {
      modemId: row.modemId,
      customer: row.customer ?? (exact || null),
      day,
      ctdUsageMb,
      ctdSms: row.ctdSms ?? 0,
      ctdVoiceMin: row.ctdVoiceMin ?? 0,
      allowanceMb,
      simCount: row.simCount,
      snapshottedAt: row.updatedAt ?? new Date().toISOString(),
      pct: allowanceMb > 0 ? Math.round((ctdUsageMb / allowanceMb) * 100) : 0,
      perSimAllowanceMb: perSim,
      topupSimUnits: topupUnits.get(row.modemId) ?? 0,
      topupAllowanceMb: extraMb,
      unitPriceAud: unitPrices.has(row.modemId) ? (unitPrices.get(row.modemId) ?? 0) : null,
    };
  });
}

async function unitPricesByModemName(tenantId: string): Promise<Map<string, number>> {
  const hasUnitPrice = await portalTableHasColumn("tenant_plan_assignments", "unit_price_aud");
  if (!hasUnitPrice) return new Map();
  const rows = await getDB()
    .prepare(
      `SELECT TRIM(p.name) AS modem_id, IFNULL(a.unit_price_aud, 0) AS unit_price_aud
       FROM tenant_plan_assignments a
       JOIN platform_plans p ON p.id = a.platform_plan_id
       WHERE a.tenant_id = ? AND TRIM(IFNULL(p.name, '')) != ''`,
    )
    .bind(tenantId)
    .all<{ modem_id: string; unit_price_aud: number }>();
  return new Map((rows.results ?? []).map((row) => [row.modem_id, Number(row.unit_price_aud) || 0]));
}

/**
 * Live aggregates by Catalyst Reseller Plan.
 * When tenantId is set, start from that org’s sims.platform_plan_id (what SIMs shows) —
 * do not require cc_devices.customer match, which dropped plans like EN_50MB_Lift.
 */
async function listLivePoolModemLatest(input?: {
  q?: string;
  exactCustomer?: string;
  tenantId?: string;
}): Promise<ModemAllowanceRow[]> {
  if (input?.exactCustomer !== undefined && !input.exactCustomer.trim()) return [];
  const exact = input?.exactCustomer?.trim() ?? "";
  const q = input?.q?.trim() ?? "";
  const tenantId = input?.tenantId?.trim() ?? "";

  const smsExpr = await modemAllowanceSmsExpr();
  const voiceExpr = await modemAllowanceVoiceExpr();

  if (tenantId) {
    const rows = await getDB()
      .prepare(
        `SELECT TRIM(pp.name) AS modem_id,
                MAX(IFNULL(NULLIF(TRIM(d.customer), ''), ?)) AS customer,
                COUNT(*) AS sim_count,
                IFNULL(SUM(IFNULL(d.ctd_usage_mb, 0)), 0) AS ctd_usage_mb,
                IFNULL(SUM(IFNULL(d.ctd_sms, 0)), 0) AS ctd_sms,
                IFNULL(SUM(IFNULL(d.ctd_voice_min, 0)), 0) AS ctd_voice_min,
                a.allowance_mb AS allowance_mb,
                ${smsExpr} AS allowance_sms,
                ${voiceExpr} AS allowance_voice_min,
                a.updated_at AS updated_at,
                a.updated_by AS updated_by
         FROM sims s
         JOIN platform_plans pp ON pp.id = s.platform_plan_id
         LEFT JOIN cc_devices d ON d.iccid = s.iccid
         LEFT JOIN modem_allowances a ON a.modem_id = TRIM(pp.name)
         WHERE s.tenant_id = ?
           AND s.platform_plan_id IS NOT NULL AND TRIM(s.platform_plan_id) != ''
           AND TRIM(IFNULL(pp.name, '')) != ''
           AND (? = '' OR TRIM(pp.name) LIKE ? OR IFNULL(d.customer, '') LIKE ?)
         GROUP BY TRIM(pp.name)
         ORDER BY modem_id COLLATE NOCASE
         LIMIT 2000`,
      )
      .bind(exact, tenantId, q, `%${q}%`, `%${q}%`)
      .all<{
        modem_id: string;
        customer: string | null;
        sim_count: number;
        ctd_usage_mb: number;
        ctd_sms: number;
        ctd_voice_min: number;
        allowance_mb: number | null;
        allowance_sms: number | null;
        allowance_voice_min: number | null;
        updated_at: string | null;
        updated_by: string | null;
      }>();

    return (rows.results ?? []).map((row) => ({
      modemId: row.modem_id,
      allowanceMb: row.allowance_mb,
      allowanceSms: row.allowance_sms,
      allowanceVoiceMin: row.allowance_voice_min,
      customer: row.customer,
      simCount: row.sim_count,
      ctdUsageMb: row.ctd_usage_mb,
      ctdSms: row.ctd_sms ?? 0,
      ctdVoiceMin: row.ctd_voice_min ?? 0,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    }));
  }

  const rows = await getDB()
    .prepare(
      `SELECT TRIM(COALESCE(pp.name, spp.name)) AS modem_id,
              MAX(d.customer) AS customer,
              COUNT(*) AS sim_count,
              IFNULL(SUM(IFNULL(d.ctd_usage_mb, 0)), 0) AS ctd_usage_mb,
              IFNULL(SUM(IFNULL(d.ctd_sms, 0)), 0) AS ctd_sms,
              IFNULL(SUM(IFNULL(d.ctd_voice_min, 0)), 0) AS ctd_voice_min,
              a.allowance_mb AS allowance_mb,
              ${smsExpr} AS allowance_sms,
              ${voiceExpr} AS allowance_voice_min,
              a.updated_at AS updated_at,
              a.updated_by AS updated_by
       FROM cc_devices d
       LEFT JOIN platform_plans pp ON pp.id = d.platform_plan_id
       LEFT JOIN sims s ON s.iccid = d.iccid
       LEFT JOIN platform_plans spp ON spp.id = s.platform_plan_id
       LEFT JOIN modem_allowances a
         ON a.modem_id = TRIM(COALESCE(pp.name, spp.name))
       WHERE TRIM(COALESCE(pp.name, spp.name, '')) != ''
         AND (? = '' OR IFNULL(d.customer, '') = ?)
         AND (? = '' OR TRIM(COALESCE(pp.name, spp.name)) LIKE ? OR IFNULL(d.customer, '') LIKE ?)
       GROUP BY TRIM(COALESCE(pp.name, spp.name))
       ORDER BY modem_id COLLATE NOCASE
       LIMIT 2000`,
    )
    .bind(exact, exact, q, `%${q}%`, `%${q}%`)
    .all<{
      modem_id: string;
      customer: string | null;
      sim_count: number;
      ctd_usage_mb: number;
      ctd_sms: number;
      ctd_voice_min: number;
      allowance_mb: number | null;
      allowance_sms: number | null;
      allowance_voice_min: number | null;
      updated_at: string | null;
      updated_by: string | null;
    }>();

  return (rows.results ?? []).map((row) => ({
    modemId: row.modem_id,
    allowanceMb: row.allowance_mb,
    allowanceSms: row.allowance_sms,
    allowanceVoiceMin: row.allowance_voice_min,
    customer: row.customer,
    simCount: row.sim_count,
    ctdUsageMb: row.ctd_usage_mb,
    ctdSms: row.ctd_sms ?? 0,
    ctdVoiceMin: row.ctd_voice_min ?? 0,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

export async function listPoolModemSeries(input: {
  modemIds?: string[];
  exactCustomer?: string;
  tenantId?: string;
  fromDay?: string;
  toDay?: string;
  limit?: number;
}): Promise<PoolModemDay[]> {
  if (input.exactCustomer !== undefined && !input.exactCustomer.trim()) return [];
  const exact = input.exactCustomer?.trim() ?? "";
  let ids = (input.modemIds ?? []).map((id) => id.trim()).filter(Boolean);
  const fromDay = input.fromDay?.trim() || sydneyDayKeyDaysAgo(POOL_SERIES_DEFAULT_DAYS - 1);
  const toDay = input.toDay?.trim() || sydneyDayKey();
  const limit = Math.min(Math.max(input.limit ?? 2000, 1), 5000);
  const liveAllowances = await sumLivePoolAllowancesByModem({
    exactCustomer: input.exactCustomer,
    tenantId: input.tenantId,
  });

  // Scope by live Reseller Plans for this org — same keys as SIMs / listPoolModemLatest.
  if ((exact || input.tenantId) && ids.length === 0) {
    ids = [...liveAllowances.keys()];
    if (ids.length === 0) return [];
  }

  const mapRow = (row: {
    modem_id: string;
    customer: string | null;
    day: string;
    ctd_usage_mb: number;
    ctd_sms: number;
    ctd_voice_min: number;
    allowance_mb: number;
    sim_count: number;
    snapshotted_at: string;
  }): PoolModemDay => ({
    modemId: row.modem_id,
    customer: row.customer,
    day: row.day,
    ctdUsageMb: row.ctd_usage_mb,
    ctdSms: row.ctd_sms ?? 0,
    ctdVoiceMin: row.ctd_voice_min ?? 0,
    allowanceMb: liveAllowances.get(row.modem_id) ?? row.allowance_mb ?? 0,
    simCount: row.sim_count,
    snapshottedAt: row.snapshotted_at,
  });

  if (ids.length === 0) {
    const rows = await getDB()
      .prepare(
        `SELECT modem_id, customer, day, ctd_usage_mb, IFNULL(ctd_sms, 0) AS ctd_sms,
                IFNULL(ctd_voice_min, 0) AS ctd_voice_min, allowance_mb, sim_count, snapshotted_at
         FROM pool_modem_daily
         WHERE (? = '' OR day >= ?)
           AND (? = '' OR day <= ?)
         ORDER BY day ASC, modem_id COLLATE NOCASE
         LIMIT ?`,
      )
      .bind(fromDay, fromDay, toDay, toDay, limit)
      .all<{
        modem_id: string;
        customer: string | null;
        day: string;
        ctd_usage_mb: number;
        ctd_sms: number;
        ctd_voice_min: number;
        allowance_mb: number;
        sim_count: number;
        snapshotted_at: string;
      }>();
    return (rows.results ?? []).map(mapRow);
  }

  const placeholders = ids.map(() => "?").join(", ");
  const rows = await getDB()
    .prepare(
      `SELECT modem_id, customer, day, ctd_usage_mb, IFNULL(ctd_sms, 0) AS ctd_sms,
              IFNULL(ctd_voice_min, 0) AS ctd_voice_min, allowance_mb, sim_count, snapshotted_at
       FROM pool_modem_daily
       WHERE modem_id IN (${placeholders})
         AND (? = '' OR day >= ?)
         AND (? = '' OR day <= ?)
       ORDER BY day ASC, modem_id COLLATE NOCASE
       LIMIT ?`,
    )
    .bind(...ids, fromDay, fromDay, toDay, toDay, limit)
    .all<{
      modem_id: string;
      customer: string | null;
      day: string;
      ctd_usage_mb: number;
      ctd_sms: number;
      ctd_voice_min: number;
      allowance_mb: number;
      sim_count: number;
      snapshotted_at: string;
    }>();
  return (rows.results ?? []).map(mapRow);
}
