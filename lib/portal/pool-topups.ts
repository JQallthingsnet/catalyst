import { getDB } from "@/lib/env";
import { newId } from "@/lib/portal/ids";
import { writeAudit } from "@/lib/portal/repo";
import { portalTableHasColumn } from "@/lib/portal/d1-compat";
import { loadTenant } from "@/lib/portal/tenant";
import { sydneyYmd } from "@/lib/portal/time";

export type PoolModemTopup = {
  id: string;
  tenantId: string;
  modemId: string;
  monthKey: string;
  simUnits: number;
  unitPriceAud: number;
  perSimAllowanceMb: number;
  allowanceMb: number;
  chargeAud: number;
  createdAt: string;
  createdBy: string;
};

export function sydneyMonthKey(at: Date = new Date()): string {
  const { year, month } = sydneyYmd(at);
  return `${year}-${String(month).padStart(2, "0")}`;
}

async function topupsTableReady(): Promise<boolean> {
  const row = await getDB()
    .prepare(`SELECT name FROM pragma_table_info('pool_modem_topups') WHERE name = 'id' LIMIT 1`)
    .first<{ name: string }>();
  return Boolean(row);
}

/** Extra pool data MB for this org’s Reseller Plans in the given Sydney month. */
export async function sumPoolTopupMbByModem(input: {
  tenantId: string;
  monthKey?: string;
}): Promise<Map<string, number>> {
  const tenantId = input.tenantId.trim();
  if (!tenantId) return new Map();
  if (!(await topupsTableReady())) return new Map();
  const monthKey = (input.monthKey ?? sydneyMonthKey()).trim();
  const rows = await getDB()
    .prepare(
      `SELECT modem_id, IFNULL(SUM(allowance_mb), 0) AS allowance_mb
       FROM pool_modem_topups
       WHERE tenant_id = ? AND month_key = ?
       GROUP BY modem_id`,
    )
    .bind(tenantId, monthKey)
    .all<{ modem_id: string; allowance_mb: number }>();
  return new Map((rows.results ?? []).map((row) => [row.modem_id, row.allowance_mb ?? 0]));
}

/** Extra SIM units topped up this month (for UI). */
export async function sumPoolTopupUnitsByModem(input: {
  tenantId: string;
  monthKey?: string;
}): Promise<Map<string, number>> {
  const tenantId = input.tenantId.trim();
  if (!tenantId) return new Map();
  if (!(await topupsTableReady())) return new Map();
  const monthKey = (input.monthKey ?? sydneyMonthKey()).trim();
  const rows = await getDB()
    .prepare(
      `SELECT modem_id, IFNULL(SUM(sim_units), 0) AS sim_units
       FROM pool_modem_topups
       WHERE tenant_id = ? AND month_key = ?
       GROUP BY modem_id`,
    )
    .bind(tenantId, monthKey)
    .all<{ modem_id: string; sim_units: number }>();
  return new Map((rows.results ?? []).map((row) => [row.modem_id, row.sim_units ?? 0]));
}

export async function listPoolModemTopups(input: {
  tenantId: string;
  monthKey?: string;
  limit?: number;
}): Promise<PoolModemTopup[]> {
  const tenantId = input.tenantId.trim();
  if (!tenantId) return [];
  if (!(await topupsTableReady())) return [];
  const monthKey = input.monthKey?.trim() ?? "";
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 2000);
  const rows = monthKey
    ? await getDB()
        .prepare(
          `SELECT id, tenant_id, modem_id, month_key, sim_units, unit_price_aud,
                  per_sim_allowance_mb, allowance_mb, charge_aud, created_at, created_by
           FROM pool_modem_topups
           WHERE tenant_id = ? AND month_key = ?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .bind(tenantId, monthKey, limit)
        .all<{
          id: string;
          tenant_id: string;
          modem_id: string;
          month_key: string;
          sim_units: number;
          unit_price_aud: number;
          per_sim_allowance_mb: number;
          allowance_mb: number;
          charge_aud: number;
          created_at: string;
          created_by: string;
        }>()
    : await getDB()
        .prepare(
          `SELECT id, tenant_id, modem_id, month_key, sim_units, unit_price_aud,
                  per_sim_allowance_mb, allowance_mb, charge_aud, created_at, created_by
           FROM pool_modem_topups
           WHERE tenant_id = ?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .bind(tenantId, limit)
        .all<{
          id: string;
          tenant_id: string;
          modem_id: string;
          month_key: string;
          sim_units: number;
          unit_price_aud: number;
          per_sim_allowance_mb: number;
          allowance_mb: number;
          charge_aud: number;
          created_at: string;
          created_by: string;
        }>();

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    modemId: row.modem_id,
    monthKey: row.month_key,
    simUnits: row.sim_units,
    unitPriceAud: row.unit_price_aud,
    perSimAllowanceMb: row.per_sim_allowance_mb,
    allowanceMb: row.allowance_mb,
    chargeAud: row.charge_aud,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }));
}

/**
 * Buy a pool top-up: immediately adds sim_units × per-SIM data allowance for the
 * current Sydney month. Does not ship SIMs.
 */
export async function createPoolModemTopup(input: {
  tenantId: string;
  modemId: string;
  simUnits: number;
  actorEmail: string;
}): Promise<PoolModemTopup> {
  if (!(await topupsTableReady())) {
    throw new Error("Pool top-ups are not available yet. Apply migrations and retry.");
  }
  const tenantId = input.tenantId.trim();
  const modemId = input.modemId.trim();
  if (!tenantId) throw new Error("Organisation is required.");
  if (!modemId) throw new Error("Reseller Plan is required.");
  const simUnits = Math.floor(Number(input.simUnits));
  if (!Number.isFinite(simUnits) || simUnits < 1 || simUnits > 5000) {
    throw new Error("SIM units must be between 1 and 5,000.");
  }

  const db = getDB();
  const plan = await db
    .prepare(
      `SELECT p.id AS platform_plan_id, TRIM(p.name) AS name
       FROM platform_plans p
       WHERE TRIM(p.name) = ?
       LIMIT 1`,
    )
    .bind(modemId)
    .first<{ platform_plan_id: string; name: string }>();
  if (!plan) throw new Error(`Reseller Plan “${modemId}” was not found.`);

  const onContract = await db
    .prepare(
      `SELECT 1 AS ok FROM tenant_plan_assignments
       WHERE tenant_id = ? AND platform_plan_id = ? LIMIT 1`,
    )
    .bind(tenantId, plan.platform_plan_id)
    .first<{ ok: number }>();
  if (!onContract) {
    throw new Error(
      `“${modemId}” is on SIMs (e.g. carried from Jasper) but not on the contract. Ask ATN to add it under Contract and set a unit price before buying a pool top-up.`,
    );
  }

  const hasUnitPrice = await portalTableHasColumn("tenant_plan_assignments", "unit_price_aud");
  const priceRow = hasUnitPrice
    ? await db
        .prepare(
          `SELECT IFNULL(unit_price_aud, 0) AS unit_price_aud
           FROM tenant_plan_assignments
           WHERE tenant_id = ? AND platform_plan_id = ?`,
        )
        .bind(tenantId, plan.platform_plan_id)
        .first<{ unit_price_aud: number }>()
    : { unit_price_aud: 0 };

  const allowanceRow = await db
    .prepare(`SELECT allowance_mb FROM modem_allowances WHERE modem_id = ?`)
    .bind(modemId)
    .first<{ allowance_mb: number | null }>();
  const perSim = allowanceRow?.allowance_mb;
  if (perSim == null) {
    throw new Error(`Set a data allowance for “${modemId}” before buying a pool top-up.`);
  }
  if (!(perSim > 0)) {
    throw new Error(`“${modemId}” is PAYG (0 MB) — pool top-up does not apply.`);
  }

  const unitPriceAud = Math.round((Number(priceRow?.unit_price_aud) || 0) * 100) / 100;
  const allowanceMb = Math.round(perSim * simUnits * 1000) / 1000;
  const chargeAud = Math.round(unitPriceAud * simUnits * 100) / 100;
  const monthKey = sydneyMonthKey();
  const id = newId("ptu");
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO pool_modem_topups
         (id, tenant_id, modem_id, month_key, sim_units, unit_price_aud,
          per_sim_allowance_mb, allowance_mb, charge_aud, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      tenantId,
      modemId,
      monthKey,
      simUnits,
      unitPriceAud,
      perSim,
      allowanceMb,
      chargeAud,
      now,
      input.actorEmail,
    )
    .run();

  await writeAudit(
    tenantId,
    input.actorEmail,
    "pool",
    `Pool top-up ${modemId} × ${simUnits} SIM unit${simUnits === 1 ? "" : "s"} · +${allowanceMb.toLocaleString("en-AU")} MB · $${chargeAud.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${monthKey}`,
  );

  // Soft-fail: top-up already applied even if SMTP / recipients misconfigured.
  try {
    const { notifySuperAdminsOfPoolTopup } = await import("@/lib/portal/order-notify");
    const tenant = await loadTenant(tenantId);
    const result = await notifySuperAdminsOfPoolTopup({
      topupId: id,
      tenantName: tenant?.name ?? tenantId,
      modemId,
      simUnits,
      allowanceMb,
      unitPriceAud,
      chargeAud,
      monthKey,
      createdBy: input.actorEmail,
    });
    if (result.errors.length > 0) {
      console.error("[pool-topup-notify]", result.errors.join("; "));
    }
  } catch (err) {
    console.error("[pool-topup-notify]", err instanceof Error ? err.message : err);
  }

  return {
    id,
    tenantId,
    modemId,
    monthKey,
    simUnits,
    unitPriceAud,
    perSimAllowanceMb: perSim,
    allowanceMb,
    chargeAud,
    createdAt: now,
    createdBy: input.actorEmail,
  };
}
