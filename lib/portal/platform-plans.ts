import { getDB } from "@/lib/env";
import { commPlanById, wholesalePlanById } from "@/lib/portal/catalogue";
import { newId } from "@/lib/portal/ids";
import { loadTenant } from "@/lib/portal/tenant";

export type PlatformPlan = {
  id: string;
  name: string;
  ccRatePlan: string;
  commPlan: string;
  createdAt: string;
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

export async function listPlatformPlans(): Promise<PlatformPlan[]> {
  const rows = await getDB()
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
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    ccRatePlan: row.cc_rate_plan,
    commPlan: row.comm_plan,
    createdAt: row.created_at,
    assignedResellers: row.assigned_resellers,
    simCount: row.sim_count,
  }));
}

export async function getPlatformPlan(id: string): Promise<PlatformPlan | null> {
  const plans = await listPlatformPlans();
  return plans.find((plan) => plan.id === id) ?? null;
}

export async function createPlatformPlan(
  actorEmail: string,
  input: { name: string; ccRatePlan: string; commPlan: string },
): Promise<PlatformPlan> {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Enter a plan name.");
  const cc = wholesalePlanById(input.ccRatePlan);
  if (!cc) throw new Error("Unknown Control Center rate plan.");
  const comm = commPlanById(input.commPlan);
  if (!comm) throw new Error("Unknown communication plan.");
  const id = newId("pplan");
  const createdAt = new Date().toISOString();
  await getDB()
    .prepare("INSERT INTO platform_plans (id, name, cc_rate_plan, comm_plan, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, name, cc.id, comm.id, createdAt)
    .run();
  return {
    id,
    name,
    ccRatePlan: cc.id,
    commPlan: comm.id,
    createdAt,
    assignedResellers: 0,
    simCount: 0,
  };
}

export async function assignPlatformPlanToTenant(
  actorEmail: string,
  tenantId: string,
  platformPlanId: string,
): Promise<void> {
  const tenant = await loadTenant(tenantId);
  if (!tenant) throw new Error("Organisation not found.");
  const plan = await getDB()
    .prepare("SELECT id, name FROM platform_plans WHERE id = ?")
    .bind(platformPlanId)
    .first<{ id: string; name: string }>();
  if (!plan) throw new Error("Plan not found.");
  await getDB()
    .prepare(
      `INSERT INTO tenant_plan_assignments (tenant_id, platform_plan_id, created_at) VALUES (?, ?, ?)
       ON CONFLICT(tenant_id, platform_plan_id) DO NOTHING`,
    )
    .bind(tenant.id, plan.id, new Date().toISOString())
    .run();
  await getDB()
    .prepare(
      `INSERT INTO audit_events (id, tenant_id, actor_email, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId("aud"), tenant.id, actorEmail, "plan", `Contract: ${plan.name} assigned`, new Date().toISOString())
    .run();
}

export async function listAssignedPlatformPlans(tenantId: string): Promise<PlatformPlan[]> {
  const rows = await getDB()
    .prepare(
      `SELECT p.id, p.name, p.cc_rate_plan, p.comm_plan, p.created_at
       FROM platform_plans p
       JOIN tenant_plan_assignments a ON a.platform_plan_id = p.id
       WHERE a.tenant_id = ?
       ORDER BY p.name COLLATE NOCASE`,
    )
    .bind(tenantId)
    .all<{ id: string; name: string; cc_rate_plan: string; comm_plan: string; created_at: string }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    ccRatePlan: row.cc_rate_plan,
    commPlan: row.comm_plan,
    createdAt: row.created_at,
    assignedResellers: 0,
    simCount: 0,
  }));
}

export async function listAllTenantPlanIds(): Promise<{ tenantId: string; platformPlanId: string }[]> {
  const rows = await getDB()
    .prepare("SELECT tenant_id, platform_plan_id FROM tenant_plan_assignments")
    .all<{ tenant_id: string; platform_plan_id: string }>();
  return (rows.results ?? []).map((row) => ({ tenantId: row.tenant_id, platformPlanId: row.platform_plan_id }));
}

export async function tenantHasPlatformPlan(tenantId: string, platformPlanId: string): Promise<boolean> {
  const row = await getDB()
    .prepare("SELECT tenant_id FROM tenant_plan_assignments WHERE tenant_id = ? AND platform_plan_id = ?")
    .bind(tenantId, platformPlanId)
    .first();
  return Boolean(row);
}

export async function loadPlatformPlanRecord(id: string) {
  return getDB()
    .prepare("SELECT id, name, cc_rate_plan, comm_plan FROM platform_plans WHERE id = ?")
    .bind(id)
    .first<{ id: string; name: string; cc_rate_plan: string; comm_plan: string }>();
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
