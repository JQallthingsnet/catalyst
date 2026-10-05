import { getDB } from "@/lib/env";
import { newId } from "@/lib/portal/ids";
import { loadPlatformPlanRecord, tenantHasPlatformPlan } from "@/lib/portal/platform-plans";
import { writeAudit } from "@/lib/portal/repo";
import type { SimState } from "@/lib/portal/catalogue";
import { isAfterActivatedRatePlanCutoff, sydneyMonthUtcBounds } from "@/lib/portal/time";

export type RatePlanChange = {
  id: string;
  tenantId: string;
  tenantName: string;
  iccid: string;
  fromPlatformPlanId: string | null;
  toPlatformPlanId: string;
  fromRatePlan: string | null;
  toRatePlan: string;
  simState: string;
  tcodeMismatch: boolean;
  actorEmail: string;
  createdAt: string;
  simStatus: SimState | null;
};

export type RatePlanChangeResult = {
  iccid: string;
  fromRatePlan: string | null;
  toRatePlan: string;
  tcodeMismatch: boolean;
  clearedRetailPlan: boolean;
};

function isActivatedState(state: SimState): boolean {
  return state !== "Ready";
}

async function countChangesThisSydneyMonth(iccid: string, at = new Date()): Promise<number> {
  const { startIso, endExclusiveIso } = sydneyMonthUtcBounds(at);
  const row = await getDB()
    .prepare(
      `SELECT COUNT(*) AS c FROM sim_rate_plan_changes
       WHERE iccid = ? AND created_at >= ? AND created_at < ?`,
    )
    .bind(iccid, startIso, endExclusiveIso)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/**
 * Catalyst portal policy for ICCID rate-plan changes (no supplier push yet).
 * - Target must be on the reseller contract and active.
 * - Ready SIMs: change freely within contracted plans.
 * - After activation: only until 24:00 on the 24th (Sydney); one change per ICCID per Sydney month.
 */
export async function changeSimRatePlan(
  tenantId: string,
  actorEmail: string,
  input: { iccid: string; platformPlanId: string },
): Promise<RatePlanChangeResult> {
  const db = getDB();
  const iccid = input.iccid.replace(/\s/g, "");
  const platformPlanId = input.platformPlanId.trim();
  if (!iccid) throw new Error("ICCID is required.");
  if (!platformPlanId) throw new Error("Choose a rate plan.");

  const sim = await db
    .prepare(
      `SELECT id, state, platform_plan_id, wholesale_plan, plan_id
       FROM sims WHERE tenant_id = ? AND iccid = ?`,
    )
    .bind(tenantId, iccid)
    .first<{
      id: string;
      state: SimState;
      platform_plan_id: string | null;
      wholesale_plan: string | null;
      plan_id: string | null;
    }>();
  if (!sim) throw new Error("SIM not found in this organisation.");

  if (sim.platform_plan_id === platformPlanId) {
    throw new Error("This SIM is already on that rate plan.");
  }

  const allowed = await tenantHasPlatformPlan(tenantId, platformPlanId);
  if (!allowed) throw new Error("That rate plan is not on this reseller’s contract.");

  const target = await loadPlatformPlanRecord(platformPlanId);
  if (!target) throw new Error("Rate plan not found.");
  if (!target.active) throw new Error("That rate plan is deactivated.");

  const now = new Date();
  if (isActivatedState(sim.state)) {
    if (isAfterActivatedRatePlanCutoff(now)) {
      throw new Error("Changes will be effective next month");
    }
    const prior = await countChangesThisSydneyMonth(iccid, now);
    if (prior >= 1) {
      throw new Error("Only one rate-plan change per ICCID is allowed each month.");
    }
  }

  const cc = await db
    .prepare("SELECT rate_plan FROM cc_devices WHERE iccid = ?")
    .bind(iccid)
    .first<{ rate_plan: string | null }>();
  const ccRate = cc?.rate_plan?.trim() || null;
  const toRatePlan = target.cc_rate_plan;
  const tcodeMismatch = Boolean(ccRate && ccRate !== toRatePlan);

  let clearedRetailPlan = false;
  if (sim.plan_id) {
    const retail = await db
      .prepare("SELECT platform_plan_id FROM plans WHERE id = ? AND tenant_id = ?")
      .bind(sim.plan_id, tenantId)
      .first<{ platform_plan_id: string | null }>();
    if (retail?.platform_plan_id && retail.platform_plan_id !== platformPlanId) {
      await db
        .prepare("UPDATE sims SET plan_id = NULL WHERE id = ? AND tenant_id = ?")
        .bind(sim.id, tenantId)
        .run();
      clearedRetailPlan = true;
    }
  }

  await db
    .prepare(
      `UPDATE sims SET platform_plan_id = ?, wholesale_plan = ? WHERE id = ? AND tenant_id = ?`,
    )
    .bind(platformPlanId, toRatePlan, sim.id, tenantId)
    .run();

  const changeId = newId("rpc");
  const createdAt = now.toISOString();
  await db
    .prepare(
      `INSERT INTO sim_rate_plan_changes
        (id, tenant_id, iccid, from_platform_plan_id, to_platform_plan_id,
         from_rate_plan, to_rate_plan, sim_state, tcode_mismatch, actor_email, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      changeId,
      tenantId,
      iccid,
      sim.platform_plan_id,
      platformPlanId,
      sim.wholesale_plan,
      toRatePlan,
      sim.state,
      tcodeMismatch ? 1 : 0,
      actorEmail,
      createdAt,
    )
    .run();

  const mismatchNote = tcodeMismatch
    ? ` · Supplier rate-plan code mismatch vs snapshot (${ccRate}) — billing notification pending`
    : "";
  await writeAudit(
    tenantId,
    actorEmail,
    "rate_plan",
    `${iccid}: ${sim.wholesale_plan ?? "—"} → ${toRatePlan}${clearedRetailPlan ? " · retail plan cleared" : ""}${mismatchNote}`,
  );

  return {
    iccid,
    fromRatePlan: sim.wholesale_plan,
    toRatePlan,
    tcodeMismatch,
    clearedRetailPlan,
  };
}

export async function listRatePlanChanges(options: {
  tenantId?: string;
  limit?: number;
}): Promise<RatePlanChange[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const db = getDB();
  const rows = options.tenantId
    ? await db
        .prepare(
          `SELECT c.id, c.tenant_id, t.name AS tenant_name, c.iccid,
                  c.from_platform_plan_id, c.to_platform_plan_id,
                  c.from_rate_plan, c.to_rate_plan, c.sim_state, c.tcode_mismatch,
                  c.actor_email, c.created_at, s.state AS current_state
           FROM sim_rate_plan_changes c
           JOIN tenants t ON t.id = c.tenant_id
           LEFT JOIN sims s ON s.iccid = c.iccid AND s.tenant_id = c.tenant_id
           WHERE c.tenant_id = ?
           ORDER BY c.created_at DESC
           LIMIT ?`,
        )
        .bind(options.tenantId, limit)
        .all<{
          id: string;
          tenant_id: string;
          tenant_name: string;
          iccid: string;
          from_platform_plan_id: string | null;
          to_platform_plan_id: string;
          from_rate_plan: string | null;
          to_rate_plan: string;
          sim_state: string;
          tcode_mismatch: number;
          actor_email: string;
          created_at: string;
          current_state: SimState | null;
        }>()
    : await db
        .prepare(
          `SELECT c.id, c.tenant_id, t.name AS tenant_name, c.iccid,
                  c.from_platform_plan_id, c.to_platform_plan_id,
                  c.from_rate_plan, c.to_rate_plan, c.sim_state, c.tcode_mismatch,
                  c.actor_email, c.created_at, s.state AS current_state
           FROM sim_rate_plan_changes c
           JOIN tenants t ON t.id = c.tenant_id
           LEFT JOIN sims s ON s.iccid = c.iccid AND s.tenant_id = c.tenant_id
           ORDER BY c.created_at DESC
           LIMIT ?`,
        )
        .bind(limit)
        .all<{
          id: string;
          tenant_id: string;
          tenant_name: string;
          iccid: string;
          from_platform_plan_id: string | null;
          to_platform_plan_id: string;
          from_rate_plan: string | null;
          to_rate_plan: string;
          sim_state: string;
          tcode_mismatch: number;
          actor_email: string;
          created_at: string;
          current_state: SimState | null;
        }>();

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    iccid: row.iccid,
    fromPlatformPlanId: row.from_platform_plan_id,
    toPlatformPlanId: row.to_platform_plan_id,
    fromRatePlan: row.from_rate_plan,
    toRatePlan: row.to_rate_plan,
    simState: row.sim_state,
    tcodeMismatch: Boolean(row.tcode_mismatch),
    actorEmail: row.actor_email,
    createdAt: row.created_at,
    simStatus: row.current_state,
  }));
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** CSV for email / billing — scoped like the Plan changes page. */
export async function exportRatePlanChangesCsv(options: {
  tenantId?: string;
  includeOrganisation: boolean;
}): Promise<string> {
  const changes = await listRatePlanChanges({
    tenantId: options.tenantId,
    limit: 500,
  });
  const headers = options.includeOrganisation
    ? [
        "when",
        "organisation",
        "iccid",
        "from_rate_plan",
        "to_rate_plan",
        "state_at_change",
        "current_state",
        "supplier_code_match",
        "changed_by",
      ]
    : [
        "when",
        "iccid",
        "from_rate_plan",
        "to_rate_plan",
        "state_at_change",
        "current_state",
        "supplier_code_match",
        "changed_by",
      ];
  const lines = [headers.join(",")];
  for (const row of changes) {
    const cells = options.includeOrganisation
      ? [
          row.createdAt,
          row.tenantName,
          row.iccid,
          row.fromRatePlan,
          row.toRatePlan,
          row.simState,
          row.simStatus,
          row.tcodeMismatch ? "mismatch" : "ok",
          row.actorEmail,
        ]
      : [
          row.createdAt,
          row.iccid,
          row.fromRatePlan,
          row.toRatePlan,
          row.simState,
          row.simStatus,
          row.tcodeMismatch ? "mismatch" : "ok",
          row.actorEmail,
        ];
    lines.push(cells.map(csvEscape).join(","));
  }
  return `${lines.join("\n")}\n`;
}
