/**
 * Reseller isolation rules (enforced in code, not by the client):
 * - For resellers, tenantId comes only from membership, never from the request body.
 * - Super admins may switch organisation through a dedicated API that checks
 *   isListedSuperAdmin and that the tenant row exists. Reseller SIM / customer
 *   pages still use one tenantId.
 * - Estate is the ACMA read across tenants. Wholesale allocate writes SIMs into
 *   one chosen reseller after the tenant row is loaded again on the server.
 * - IDs from the client (customer, plan, pool, ICCID) are loaded again with that tenant_id.
 * - One email belongs to one tenant. Invites cannot attach someone to a second organisation.
 * - View-as only changes privileges for listed super admins; it does not change tenantId.
 */
import { getDB } from "@/lib/env";
import { newId } from "@/lib/portal/ids";

export type TenantRecord = { id: string; name: string; createdAt: string };

export type PlatformTenant = TenantRecord & {
  simCount: number;
  customerCount: number;
  memberCount: number;
};

export async function membershipTenantId(email: string): Promise<string | null> {
  const row = await getDB()
    .prepare("SELECT tenant_id FROM tenant_members WHERE email = ?")
    .bind(email)
    .first<{ tenant_id: string }>();
  return row?.tenant_id ?? null;
}

export async function loadTenant(id: string): Promise<TenantRecord | null> {
  const row = await getDB()
    .prepare("SELECT id, name, created_at FROM tenants WHERE id = ?")
    .bind(id)
    .first<{ id: string; name: string; created_at: string }>();
  if (!row) return null;
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export async function listTenantOptions(): Promise<{ id: string; name: string }[]> {
  const rows = await getDB()
    .prepare("SELECT id, name FROM tenants ORDER BY name COLLATE NOCASE")
    .all<{ id: string; name: string }>();
  return rows.results ?? [];
}

export async function listPlatformTenants(isSuperAdmin: boolean): Promise<PlatformTenant[]> {
  if (!isSuperAdmin) return [];
  const rows = await getDB()
    .prepare(
      `SELECT t.id, t.name, t.created_at,
              (SELECT COUNT(*) FROM sims s WHERE s.tenant_id = t.id) AS sim_count,
              (SELECT COUNT(*) FROM customers c WHERE c.tenant_id = t.id) AS customer_count,
              (SELECT COUNT(*) FROM tenant_members m WHERE m.tenant_id = t.id) AS member_count
       FROM tenants t
       ORDER BY t.name COLLATE NOCASE`,
    )
    .all<{
      id: string;
      name: string;
      created_at: string;
      sim_count: number;
      customer_count: number;
      member_count: number;
    }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    simCount: row.sim_count,
    customerCount: row.customer_count,
    memberCount: row.member_count,
  }));
}

export type PlatformEstateCustomer = {
  id: string;
  name: string;
  createdAt: string;
  simCount: number;
  activeCount: number;
  plansSold: string[];
  wholesalePlans: string[];
};

export type PlatformEstateSim = {
  id: string;
  iccid: string;
  formFactor: string;
  state: string;
  customerName: string | null;
  planName: string | null;
  poolName: string | null;
  wholesalePlan: string | null;
  platformPlanName: string | null;
};

export type PlatformEstateWarehouse = {
  count: number;
  plans: { plan: string; count: number }[];
};

export type PlatformEstateTenant = {
  id: string;
  name: string;
  createdAt: string;
  members: { email: string; role: string }[];
  customers: PlatformEstateCustomer[];
  sims: PlatformEstateSim[];
  warehouse: PlatformEstateWarehouse;
  simCount: number;
  activeCount: number;
  customerCount: number;
};

export type PlatformEstate = {
  tenants: PlatformEstateTenant[];
  totals: { orgs: number; sims: number; active: number; customers: number };
};

const EMPTY_ESTATE: PlatformEstate = {
  tenants: [],
  totals: { orgs: 0, sims: 0, active: 0, customers: 0 },
};

export function excludeHomeTenant<T extends { id: string }>(rows: T[], homeTenantId: string): T[] {
  return rows.filter((row) => row.id !== homeTenantId);
}

export async function listPlatformEstate(
  actor: { isSuperAdmin: boolean; role: string; homeTenantId?: string },
  query = "",
): Promise<PlatformEstate> {
  if (!actor.isSuperAdmin || actor.role !== "super_admin") return EMPTY_ESTATE;

  const db = getDB();
  const [tenantRows, memberRows, customerRows, simRows] = await Promise.all([
    db.prepare("SELECT id, name, created_at FROM tenants ORDER BY name COLLATE NOCASE").all<{
      id: string;
      name: string;
      created_at: string;
    }>(),
    db.prepare("SELECT email, tenant_id, role FROM tenant_members ORDER BY email").all<{
      email: string;
      tenant_id: string;
      role: string;
    }>(),
    db.prepare("SELECT id, tenant_id, name, created_at FROM customers ORDER BY name").all<{
      id: string;
      tenant_id: string;
      name: string;
      created_at: string;
    }>(),
    db
      .prepare(
        `SELECT s.id, s.tenant_id, s.iccid, s.form_factor, s.state, s.customer_id, s.wholesale_plan,
                c.name as customer_name, p.name as plan_name, pl.name as pool_name, pp.name as platform_plan_name
         FROM sims s
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN plans p ON p.id = s.plan_id
         LEFT JOIN pools pl ON pl.id = s.pool_id
         LEFT JOIN platform_plans pp ON pp.id = s.platform_plan_id
         ORDER BY s.iccid ASC
         LIMIT 2000`,
      )
      .all<{
        id: string;
        tenant_id: string;
        iccid: string;
        form_factor: string;
        state: string;
        customer_id: string | null;
        wholesale_plan: string | null;
        customer_name: string | null;
        plan_name: string | null;
        pool_name: string | null;
        platform_plan_name: string | null;
      }>(),
  ]);

  const membersByTenant = new Map<string, { email: string; role: string }[]>();
  for (const row of memberRows.results ?? []) {
    const list = membersByTenant.get(row.tenant_id) ?? [];
    list.push({ email: row.email, role: row.role });
    membersByTenant.set(row.tenant_id, list);
  }

  const customersByTenant = new Map<string, PlatformEstateCustomer[]>();
  for (const row of customerRows.results ?? []) {
    const list = customersByTenant.get(row.tenant_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      simCount: 0,
      activeCount: 0,
      plansSold: [],
      wholesalePlans: [],
    });
    customersByTenant.set(row.tenant_id, list);
  }

  const simsByTenant = new Map<string, PlatformEstateSim[]>();
  const soldByCustomer = new Map<string, { simCount: number; activeCount: number; plans: Set<string>; wholesale: Set<string> }>();
  for (const row of simRows.results ?? []) {
    const list = simsByTenant.get(row.tenant_id) ?? [];
    list.push({
      id: row.id,
      iccid: row.iccid,
      formFactor: row.form_factor,
      state: row.state,
      customerName: row.customer_name,
      planName: row.plan_name,
      poolName: row.pool_name,
      wholesalePlan: row.wholesale_plan,
      platformPlanName: row.platform_plan_name,
    });
    simsByTenant.set(row.tenant_id, list);
    if (row.customer_id) {
      const sold = soldByCustomer.get(row.customer_id) ?? {
        simCount: 0,
        activeCount: 0,
        plans: new Set<string>(),
        wholesale: new Set<string>(),
      };
      sold.simCount += 1;
      if (row.state === "Active") sold.activeCount += 1;
      if (row.plan_name) sold.plans.add(row.plan_name);
      if (row.platform_plan_name) sold.wholesale.add(row.platform_plan_name);
      soldByCustomer.set(row.customer_id, sold);
    }
  }

  const q = query.trim().toLowerCase();
  const iccidQ = q.replace(/\s/g, "");
  const tenants = (tenantRows.results ?? []).map((row) => {
    const customers = (customersByTenant.get(row.id) ?? []).map((customer) => {
      const sold = soldByCustomer.get(customer.id);
      return {
        ...customer,
        simCount: sold?.simCount ?? 0,
        activeCount: sold?.activeCount ?? 0,
        plansSold: sold ? [...sold.plans] : [],
        wholesalePlans: sold ? [...sold.wholesale] : [],
      };
    });
    const sims = simsByTenant.get(row.id) ?? [];
    const warehouseSims = sims.filter((sim) => !sim.customerName);
    const warehousePlans = new Map<string, number>();
    for (const sim of warehouseSims) {
      const key = sim.platformPlanName ?? sim.wholesalePlan ?? "Unmapped";
      warehousePlans.set(key, (warehousePlans.get(key) ?? 0) + 1);
    }
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      members: membersByTenant.get(row.id) ?? [],
      customers,
      sims,
      warehouse: {
        count: warehouseSims.length,
        plans: [...warehousePlans.entries()].map(([plan, count]) => ({ plan, count })),
      },
      simCount: sims.length,
      activeCount: sims.filter((sim) => sim.state === "Active").length,
      customerCount: customers.length,
    };
  });

  const resellers = actor.homeTenantId ? tenants.filter((tenant) => tenant.id !== actor.homeTenantId) : tenants;

  const filtered = q
    ? resellers.filter((tenant) => {
        if (tenant.name.toLowerCase().includes(q)) return true;
        if (tenant.members.some((member) => member.email.toLowerCase().includes(q))) return true;
        if (
          tenant.customers.some(
            (customer) =>
              customer.name.toLowerCase().includes(q) ||
              customer.plansSold.some((plan) => plan.toLowerCase().includes(q)),
          )
        ) {
          return true;
        }
        if (tenant.sims.some((sim) => sim.iccid.toLowerCase().replace(/\s/g, "").includes(iccidQ))) return true;
        return false;
      })
    : resellers;

  const visible = q
    ? filtered.map((tenant) => {
        if (tenant.name.toLowerCase().includes(q) || tenant.members.some((member) => member.email.toLowerCase().includes(q))) {
          return tenant;
        }
        return {
          ...tenant,
          customers: tenant.customers.filter(
            (customer) =>
              customer.name.toLowerCase().includes(q) ||
              customer.plansSold.some((plan) => plan.toLowerCase().includes(q)),
          ),
          sims: tenant.sims.filter(
            (sim) =>
              sim.iccid.toLowerCase().replace(/\s/g, "").includes(iccidQ) ||
              (sim.customerName ?? "").toLowerCase().includes(q),
          ),
        };
      })
    : filtered;

  return {
    tenants: visible,
    totals: {
      orgs: resellers.length,
      sims: resellers.reduce((sum, tenant) => sum + tenant.simCount, 0),
      active: resellers.reduce((sum, tenant) => sum + tenant.activeCount, 0),
      customers: resellers.reduce((sum, tenant) => sum + tenant.customerCount, 0),
    },
  };
}

export async function createResellerOrganisation(name: string): Promise<TenantRecord> {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error("Enter an organisation name.");
  const id = newId("ten");
  const createdAt = new Date().toISOString();
  await getDB().prepare("INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)").bind(id, trimmed, createdAt).run();
  return { id, name: trimmed, createdAt };
}

export async function requireOwned<T extends { id: string }>(
  table: "customers" | "plans" | "pools",
  id: string,
  tenantId: string,
): Promise<T> {
  const row = await getDB()
    .prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`)
    .bind(id, tenantId)
    .first<T>();
  if (!row) throw new Error("That record is not in this organisation.");
  return row;
}
