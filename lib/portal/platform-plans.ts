import { getDB } from "@/lib/env";
import { newId } from "@/lib/portal/ids";
import { DEFAULT_PLAN_SUPPLIER, isListedPlanSupplier, normalizePlanSupplier } from "@/lib/portal/plan-suppliers";
import { loadTenant } from "@/lib/portal/tenant";

export { PLAN_SUPPLIERS, type PlanSupplier } from "@/lib/portal/plan-suppliers";

export type PlatformPlan = {
  id: string;
  name: string;
  supplier: string;
  ccRatePlan: string;
  commPlan: string;
  createdAt: string;
  active: boolean;
  assignedResellers: number;
  simCount: number;
};

export type PlatformPlanAssignment = {
  tenantId: string;
  tenantName: string;
  createdAt: string;
  simCount: number;
  assignedCount: number;
  warehouseCount: number;
  usageMb: number;
};

function mapPlan(row: {
  id: string;
  name: string;
  supplier?: string | null;
  cc_rate_plan: string;
  comm_plan: string;
  created_at: string;
  active?: number | null;
  assigned_resellers?: number;
  sim_count?: number;
}): PlatformPlan {
  return {
    id: row.id,
    name: row.name,
    supplier: normalizePlanSupplier(row.supplier),
    ccRatePlan: row.cc_rate_plan,
    commPlan: row.comm_plan,
    createdAt: row.created_at,
    active: row.active == null ? true : Boolean(row.active),
    assignedResellers: row.assigned_resellers ?? 0,
    simCount: row.sim_count ?? 0,
  };
}

export async function listPlatformPlans(): Promise<PlatformPlan[]> {
  const db = getDB();
  try {
    const rows = await db
      .prepare(
        `SELECT p.id, p.name, IFNULL(p.supplier, 'Optus') AS supplier,
                p.cc_rate_plan, p.comm_plan, p.created_at, IFNULL(p.active, 1) AS active,
                (SELECT COUNT(*) FROM tenant_plan_assignments a WHERE a.platform_plan_id = p.id) AS assigned_resellers,
                (SELECT COUNT(*) FROM sims s WHERE s.platform_plan_id = p.id) AS sim_count
         FROM platform_plans p
         ORDER BY IFNULL(p.active, 1) DESC, p.name COLLATE NOCASE`,
      )
      .all<{
        id: string;
        name: string;
        supplier: string;
        cc_rate_plan: string;
        comm_plan: string;
        created_at: string;
        active: number;
        assigned_resellers: number;
        sim_count: number;
      }>();
    return (rows.results ?? []).map(mapPlan);
  } catch {
    const rows = await db
      .prepare(
        `SELECT p.id, p.name, p.cc_rate_plan, p.comm_plan, p.created_at,
                (SELECT COUNT(*) FROM tenant_plan_assignments a WHERE a.platform_plan_id = p.id) AS assigned_resellers,
                (SELECT COUNT(*) FROM sims s WHERE s.platform_plan_id = p.id) AS sim_count
         FROM platform_plans p
         ORDER BY p.name COLLATE NOCASE`,
      )
      .all<{
        id: string;
        name: string;
        cc_rate_plan: string;
        comm_plan: string;
        created_at: string;
        assigned_resellers: number;
        sim_count: number;
      }>();
    return (rows.results ?? []).map((row) => mapPlan({ ...row, supplier: null, active: 1 }));
  }
}

export async function getPlatformPlan(id: string): Promise<PlatformPlan | null> {
  const db = getDB();
  try {
    const row = await db
      .prepare(
        `SELECT p.id, p.name, IFNULL(p.supplier, 'Optus') AS supplier,
                p.cc_rate_plan, p.comm_plan, p.created_at, IFNULL(p.active, 1) AS active,
                (SELECT COUNT(*) FROM tenant_plan_assignments a WHERE a.platform_plan_id = p.id) AS assigned_resellers,
                (SELECT COUNT(*) FROM sims s WHERE s.platform_plan_id = p.id) AS sim_count
         FROM platform_plans p
         WHERE p.id = ?`,
      )
      .bind(id)
      .first<{
        id: string;
        name: string;
        supplier: string;
        cc_rate_plan: string;
        comm_plan: string;
        created_at: string;
        active: number;
        assigned_resellers: number;
        sim_count: number;
      }>();
    return row ? mapPlan(row) : null;
  } catch {
    const row = await db
      .prepare(
        `SELECT p.id, p.name, p.cc_rate_plan, p.comm_plan, p.created_at,
                (SELECT COUNT(*) FROM tenant_plan_assignments a WHERE a.platform_plan_id = p.id) AS assigned_resellers,
                (SELECT COUNT(*) FROM sims s WHERE s.platform_plan_id = p.id) AS sim_count
         FROM platform_plans p
         WHERE p.id = ?`,
      )
      .bind(id)
      .first<{
        id: string;
        name: string;
        cc_rate_plan: string;
        comm_plan: string;
        created_at: string;
        assigned_resellers: number;
        sim_count: number;
      }>();
    return row ? mapPlan({ ...row, supplier: null, active: 1 }) : null;
  }
}

async function assertResellerTenant(tenantId: string, homeTenantId?: string) {
  const tenant = await loadTenant(tenantId);
  if (!tenant) throw new Error("Organisation not found.");
  if (!tenant.active) throw new Error("That organisation is deactivated.");
  if (homeTenantId && tenant.id === homeTenantId) {
    throw new Error("ATN Platform is not a reseller organisation.");
  }
  return tenant;
}

async function tenantAssignmentCount(tenantId: string): Promise<number> {
  const row = await getDB()
    .prepare("SELECT COUNT(*) AS c FROM tenant_plan_assignments WHERE tenant_id = ?")
    .bind(tenantId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

async function bindPlanToReseller(
  db: ReturnType<typeof getDB>,
  actorEmail: string,
  tenantId: string,
  platformPlanId: string,
  planName: string,
  createdAt: string,
): Promise<void> {
  const existing = await tenantAssignmentCount(tenantId);
  const isDefault = existing === 0 ? 1 : 0;
  await db
    .prepare(
      `INSERT INTO tenant_plan_assignments (tenant_id, platform_plan_id, created_at, is_default) VALUES (?, ?, ?, ?)
       ON CONFLICT(tenant_id, platform_plan_id) DO NOTHING`,
    )
    .bind(tenantId, platformPlanId, createdAt, isDefault)
    .run();
  await db
    .prepare(
      `INSERT INTO audit_events (id, tenant_id, actor_email, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId("aud"), tenantId, actorEmail, "plan", `Contract: ${planName} assigned`, createdAt)
    .run();
}

export async function createPlatformPlan(
  actorEmail: string,
  input: { name: string; supplier: string; ccRatePlan: string; commPlan: string; resellerIds: string[] },
  homeTenantId: string,
): Promise<PlatformPlan> {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Enter remarks / plan description.");
  const supplier = normalizePlanSupplier(input.supplier);
  if (!isListedPlanSupplier(supplier)) {
    throw new Error("Choose a supplier (Optus or Other).");
  }
  const ccRatePlan = input.ccRatePlan.trim();
  if (!ccRatePlan) throw new Error("Enter the supplier rate plan / TCode exactly.");
  const commPlan = input.commPlan.trim();
  if (!commPlan) throw new Error("Enter the communication plan.");
  const resellerIds = [...new Set(input.resellerIds.map((id) => id.trim()).filter(Boolean))];
  if (resellerIds.length === 0) {
    throw new Error("Bind this plan to at least one reseller (the contract).");
  }

  const resellers = [];
  for (const resellerId of resellerIds) {
    resellers.push(await assertResellerTenant(resellerId, homeTenantId));
  }

  const id = newId("pplan");
  const createdAt = new Date().toISOString();
  const db = getDB();
  await db
    .prepare(
      "INSERT INTO platform_plans (id, name, supplier, cc_rate_plan, comm_plan, created_at, active) VALUES (?, ?, ?, ?, ?, ?, 1)",
    )
    .bind(id, name, supplier, ccRatePlan, commPlan, createdAt)
    .run();

  for (const reseller of resellers) {
    await bindPlanToReseller(db, actorEmail, reseller.id, id, name, createdAt);
  }

  return {
    id,
    name,
    supplier,
    ccRatePlan,
    commPlan,
    createdAt,
    active: true,
    assignedResellers: resellers.length,
    simCount: 0,
  };
}

export async function assignPlatformPlanToTenant(
  actorEmail: string,
  tenantId: string,
  platformPlanId: string,
  homeTenantId: string,
): Promise<void> {
  const tenant = await assertResellerTenant(tenantId, homeTenantId);
  const plan = await getPlatformPlan(platformPlanId);
  if (!plan) throw new Error("Plan not found.");
  if (!plan.active) throw new Error("Reactivate this plan before assigning contracts.");
  await bindPlanToReseller(getDB(), actorEmail, tenant.id, plan.id, plan.name, new Date().toISOString());
}

export async function unassignPlatformPlanFromTenant(
  actorEmail: string,
  tenantId: string,
  platformPlanId: string,
): Promise<void> {
  const plan = await getPlatformPlan(platformPlanId);
  if (!plan) throw new Error("Plan not found.");
  const tenant = await loadTenant(tenantId);
  if (!tenant) throw new Error("Organisation not found.");
  const sims = await getDB()
    .prepare("SELECT COUNT(*) AS c FROM sims WHERE tenant_id = ? AND platform_plan_id = ?")
    .bind(tenantId, platformPlanId)
    .first<{ c: number }>();
  if ((sims?.c ?? 0) > 0) {
    throw new Error("Remove or reassign SIMs on this plan for that reseller before unbinding.");
  }
  await getDB()
    .prepare("DELETE FROM tenant_plan_assignments WHERE tenant_id = ? AND platform_plan_id = ?")
    .bind(tenantId, platformPlanId)
    .run();
  await getDB()
    .prepare(
      `INSERT INTO audit_events (id, tenant_id, actor_email, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId("aud"),
      tenantId,
      actorEmail,
      "plan",
      `Contract: ${plan.name} removed`,
      new Date().toISOString(),
    )
    .run();
}

export async function setPlatformPlanActive(id: string, active: boolean): Promise<PlatformPlan> {
  const existing = await getPlatformPlan(id);
  if (!existing) throw new Error("Plan not found.");
  await getDB()
    .prepare("UPDATE platform_plans SET active = ? WHERE id = ?")
    .bind(active ? 1 : 0, id)
    .run();
  return { ...existing, active };
}

export async function deletePlatformPlan(id: string, confirmName: string): Promise<PlatformPlan> {
  const existing = await getPlatformPlan(id);
  if (!existing) throw new Error("Plan not found.");
  if (existing.active) throw new Error("Deactivate the plan first, then delete.");
  if (confirmName.trim() !== existing.name) {
    throw new Error("Type the plan name exactly to confirm delete.");
  }
  if (existing.simCount > 0) {
    throw new Error("This plan still has SIMs. Move or clear stock before deleting.");
  }
  const db = getDB();
  await db.batch([
    db.prepare("DELETE FROM tenant_plan_assignments WHERE platform_plan_id = ?").bind(id),
    db.prepare("DELETE FROM plans WHERE platform_plan_id = ?").bind(id),
    db.prepare("DELETE FROM platform_plans WHERE id = ?").bind(id),
  ]);
  return existing;
}

/** Active contracted ATN plans visible to this reseller only. */
export async function listAssignedPlatformPlans(tenantId: string): Promise<PlatformPlan[]> {
  const rows = await getDB()
    .prepare(
      `SELECT p.id, p.name, IFNULL(p.supplier, 'Optus') AS supplier,
              p.cc_rate_plan, p.comm_plan, p.created_at, IFNULL(p.active, 1) AS active
       FROM platform_plans p
       JOIN tenant_plan_assignments a ON a.platform_plan_id = p.id
       WHERE a.tenant_id = ? AND IFNULL(p.active, 1) = 1
       ORDER BY p.name COLLATE NOCASE`,
    )
    .bind(tenantId)
    .all<{
      id: string;
      name: string;
      supplier: string;
      cc_rate_plan: string;
      comm_plan: string;
      created_at: string;
      active: number;
    }>();
  return (rows.results ?? []).map(mapPlan);
}

export async function listAllTenantPlanIds(): Promise<
  { tenantId: string; platformPlanId: string; isDefault: boolean }[]
> {
  const rows = await getDB()
    .prepare(
      `SELECT a.tenant_id, a.platform_plan_id, IFNULL(a.is_default, 0) AS is_default
       FROM tenant_plan_assignments a
       JOIN platform_plans p ON p.id = a.platform_plan_id
       WHERE IFNULL(p.active, 1) = 1`,
    )
    .all<{ tenant_id: string; platform_plan_id: string; is_default: number }>();
  return (rows.results ?? []).map((row) => ({
    tenantId: row.tenant_id,
    platformPlanId: row.platform_plan_id,
    isDefault: Boolean(row.is_default),
  }));
}

export async function setDefaultContractPlan(
  actorEmail: string,
  tenantId: string,
  platformPlanId: string,
): Promise<void> {
  const allowed = await tenantHasPlatformPlan(tenantId, platformPlanId);
  if (!allowed) throw new Error("That plan is not on contract for this reseller.");
  const db = getDB();
  await db.prepare("UPDATE tenant_plan_assignments SET is_default = 0 WHERE tenant_id = ?").bind(tenantId).run();
  await db
    .prepare("UPDATE tenant_plan_assignments SET is_default = 1 WHERE tenant_id = ? AND platform_plan_id = ?")
    .bind(tenantId, platformPlanId)
    .run();
  const plan = await getPlatformPlan(platformPlanId);
  await db
    .prepare(
      `INSERT INTO audit_events (id, tenant_id, actor_email, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId("aud"),
      tenantId,
      actorEmail,
      "plan",
      `Default plan: ${plan?.ccRatePlan ?? platformPlanId}`,
      new Date().toISOString(),
    )
    .run();
}

export type ContractBookEntry = {
  tenantId: string;
  tenantName: string;
  tenantActive: boolean;
  plans: {
    platformPlanId: string;
    ratePlanNew: string;
    remarks: string;
    supplier: string;
    commPlan: string;
    active: boolean;
    isDefault: boolean;
    simCount: number;
  }[];
};

/** Master-admin contract book: reseller → rate plans. */
export async function listContractBook(homeTenantId: string): Promise<ContractBookEntry[]> {
  const db = getDB();
  const tenants = await db
    .prepare(
      `SELECT id, name, IFNULL(active, 1) AS active
       FROM tenants
       WHERE id != ?
       ORDER BY IFNULL(active, 1) DESC, name COLLATE NOCASE`,
    )
    .bind(homeTenantId)
    .all<{ id: string; name: string; active: number }>();

  const rows = await db
    .prepare(
      `SELECT a.tenant_id, a.platform_plan_id, IFNULL(a.is_default, 0) AS is_default,
              p.name AS remarks, IFNULL(p.supplier, 'Optus') AS supplier,
              p.cc_rate_plan, p.comm_plan, IFNULL(p.active, 1) AS plan_active,
              (SELECT COUNT(*) FROM sims s WHERE s.tenant_id = a.tenant_id AND s.platform_plan_id = a.platform_plan_id) AS sim_count
       FROM tenant_plan_assignments a
       JOIN platform_plans p ON p.id = a.platform_plan_id
       ORDER BY p.cc_rate_plan COLLATE NOCASE`,
    )
    .all<{
      tenant_id: string;
      platform_plan_id: string;
      is_default: number;
      remarks: string;
      supplier: string;
      cc_rate_plan: string;
      comm_plan: string;
      plan_active: number;
      sim_count: number;
    }>();

  const byTenant = new Map<string, ContractBookEntry["plans"]>();
  for (const row of rows.results ?? []) {
    const list = byTenant.get(row.tenant_id) ?? [];
    list.push({
      platformPlanId: row.platform_plan_id,
      ratePlanNew: row.cc_rate_plan,
      remarks: row.remarks,
      supplier: row.supplier,
      commPlan: row.comm_plan,
      active: Boolean(row.plan_active),
      isDefault: Boolean(row.is_default),
      simCount: row.sim_count,
    });
    byTenant.set(row.tenant_id, list);
  }

  return (tenants.results ?? []).map((tenant) => ({
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantActive: Boolean(tenant.active),
    plans: byTenant.get(tenant.id) ?? [],
  }));
}

/** Reseller-admin view: only this organisation’s signed contract lines. */
export async function listResellerContract(tenantId: string): Promise<ContractBookEntry["plans"]> {
  const db = getDB();
  try {
    const rows = await db
      .prepare(
        `SELECT a.platform_plan_id, IFNULL(a.is_default, 0) AS is_default,
                p.name AS remarks, IFNULL(p.supplier, 'Optus') AS supplier,
                p.cc_rate_plan, p.comm_plan, IFNULL(p.active, 1) AS plan_active,
                (SELECT COUNT(*) FROM sims s WHERE s.tenant_id = a.tenant_id AND s.platform_plan_id = a.platform_plan_id) AS sim_count
         FROM tenant_plan_assignments a
         JOIN platform_plans p ON p.id = a.platform_plan_id
         WHERE a.tenant_id = ? AND IFNULL(p.active, 1) = 1
         ORDER BY IFNULL(a.is_default, 0) DESC, p.cc_rate_plan COLLATE NOCASE`,
      )
      .bind(tenantId)
      .all<{
        platform_plan_id: string;
        is_default: number;
        remarks: string;
        supplier: string;
        cc_rate_plan: string;
        comm_plan: string;
        plan_active: number;
        sim_count: number;
      }>();
    return (rows.results ?? []).map((row) => ({
      platformPlanId: row.platform_plan_id,
      ratePlanNew: row.cc_rate_plan,
      remarks: row.remarks,
      supplier: row.supplier,
      commPlan: row.comm_plan,
      active: Boolean(row.plan_active),
      isDefault: Boolean(row.is_default),
      simCount: row.sim_count,
    }));
  } catch {
    // Older D1 before supplier / is_default / active alters — still show the contract book.
    const rows = await db
      .prepare(
        `SELECT a.platform_plan_id, p.name AS remarks, p.cc_rate_plan, p.comm_plan,
                (SELECT COUNT(*) FROM sims s WHERE s.tenant_id = a.tenant_id AND s.platform_plan_id = a.platform_plan_id) AS sim_count
         FROM tenant_plan_assignments a
         JOIN platform_plans p ON p.id = a.platform_plan_id
         WHERE a.tenant_id = ?
         ORDER BY p.cc_rate_plan COLLATE NOCASE`,
      )
      .bind(tenantId)
      .all<{
        platform_plan_id: string;
        remarks: string;
        cc_rate_plan: string;
        comm_plan: string;
        sim_count: number;
      }>();
    return (rows.results ?? []).map((row) => ({
      platformPlanId: row.platform_plan_id,
      ratePlanNew: row.cc_rate_plan,
      remarks: row.remarks,
      supplier: DEFAULT_PLAN_SUPPLIER,
      commPlan: row.comm_plan,
      active: true,
      isDefault: false,
      simCount: row.sim_count,
    }));
  }
}

export async function tenantHasPlatformPlan(tenantId: string, platformPlanId: string): Promise<boolean> {
  const row = await getDB()
    .prepare(
      `SELECT a.tenant_id
       FROM tenant_plan_assignments a
       JOIN platform_plans p ON p.id = a.platform_plan_id
       WHERE a.tenant_id = ? AND a.platform_plan_id = ? AND IFNULL(p.active, 1) = 1`,
    )
    .bind(tenantId, platformPlanId)
    .first();
  return Boolean(row);
}

export async function loadPlatformPlanRecord(id: string) {
  return getDB()
    .prepare(
      `SELECT id, name, IFNULL(supplier, 'Optus') AS supplier,
              cc_rate_plan, comm_plan, IFNULL(active, 1) AS active FROM platform_plans WHERE id = ?`,
    )
    .bind(id)
    .first<{
      id: string;
      name: string;
      supplier: string;
      cc_rate_plan: string;
      comm_plan: string;
      active: number;
    }>();
}

export async function listPlatformPlanResellers(platformPlanId: string): Promise<PlatformPlanAssignment[]> {
  const rows = await getDB()
    .prepare(
      `SELECT t.id AS tenant_id, t.name AS tenant_name, a.created_at,
              (SELECT COUNT(*) FROM sims s WHERE s.tenant_id = t.id AND s.platform_plan_id = a.platform_plan_id) AS sim_count,
              (SELECT COUNT(*) FROM sims s WHERE s.tenant_id = t.id AND s.platform_plan_id = a.platform_plan_id AND s.customer_id IS NOT NULL) AS assigned_count,
              (SELECT COUNT(*) FROM sims s WHERE s.tenant_id = t.id AND s.platform_plan_id = a.platform_plan_id AND s.customer_id IS NULL) AS warehouse_count,
              (SELECT IFNULL(SUM(s.current_volume_mb), 0) FROM sims s WHERE s.tenant_id = t.id AND s.platform_plan_id = a.platform_plan_id) AS usage_mb
       FROM tenant_plan_assignments a
       JOIN tenants t ON t.id = a.tenant_id
       WHERE a.platform_plan_id = ?
       ORDER BY t.name COLLATE NOCASE`,
    )
    .bind(platformPlanId)
    .all<{
      tenant_id: string;
      tenant_name: string;
      created_at: string;
      sim_count: number;
      assigned_count: number;
      warehouse_count: number;
      usage_mb: number;
    }>();
  return (rows.results ?? []).map((row) => ({
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    createdAt: row.created_at,
    simCount: row.sim_count,
    assignedCount: row.assigned_count,
    warehouseCount: row.warehouse_count,
    usageMb: row.usage_mb,
  }));
}

export async function listPlatformPlanTopSims(platformPlanId: string, limit = 10) {
  const rows = await getDB()
    .prepare(
      `SELECT s.iccid, s.current_volume_mb, t.name AS tenant_name, c.name AS customer_name
       FROM sims s
       JOIN tenants t ON t.id = s.tenant_id
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.platform_plan_id = ?
       ORDER BY IFNULL(s.current_volume_mb, 0) DESC
       LIMIT ?`,
    )
    .bind(platformPlanId, limit)
    .all<{ iccid: string; current_volume_mb: number | null; tenant_name: string; customer_name: string | null }>();
  return (rows.results ?? []).map((row) => ({
    iccid: row.iccid,
    volumeMb: row.current_volume_mb ?? 0,
    tenantName: row.tenant_name,
    customerName: row.customer_name,
  }));
}
