import { getDB } from "@/lib/env";
import { portalTableHasColumn } from "@/lib/portal/d1-compat";
import { runCcMutation } from "@/lib/cc/adapter";
import {
  listCcDevicesForCustomer,
  materializeWarehouseForCcCustomer,
} from "@/lib/cc/devices";
import { lifecycleTarget, type OrderStatus, type SimState } from "@/lib/portal/catalogue";
import { getSimSku, listResellerSkus, listSimSkus, tenantHasSku } from "@/lib/portal/skus";
import { loadPlatformPlanRecord, tenantHasPlatformPlan } from "@/lib/portal/platform-plans";
import {
  bindTenantCcCustomer,
  findTenantByCcCustomer,
  getResellerAdminEmail,
  loadTenant,
} from "@/lib/portal/tenant";
import { newId } from "@/lib/portal/ids";
import { type PortalRole } from "@/lib/portal/role-model";
import { isListedSuperAdmin } from "@/lib/portal/roles";
import { parseYmd, sydneyDayEndExclusiveIso, sydneyDayStartIso } from "@/lib/portal/time";

export type { PortalRole };

export type PortalContext = {
  email: string;
  tenantId: string;
  tenantName: string;
  homeTenantId: string;
  homeTenantName: string;
  role: PortalRole;
  isSuperAdmin: boolean;
};

export type Customer = { id: string; name: string; createdAt: string };
export type Plan = {
  id: string;
  name: string;
  type: string;
  inclusiveMb: number;
  overage: string;
  roaming: string;
  wholesalePlan: string;
  commPlan: string;
  platformPlanId: string | null;
  platformPlanName: string | null;
  pricePerSim: number | null;
};
export type Pool = { id: string; name: string; type: string; capMb: number; usedMb: number; members: number };
export type Sim = {
  id: string;
  iccid: string;
  formFactor: string;
  state: SimState;
  customerId: string | null;
  customerName: string | null;
  planId: string | null;
  planName: string | null;
  poolId: string | null;
  poolName: string | null;
  wholesalePlan: string | null;
  platformPlanId: string | null;
  platformPlanName: string | null;
  tenantName: string | null;
  imsi: string | null;
  msisdn: string | null;
  currentVolumeMb: number | null;
  ccStatus: string | null;
  ccPolledAt: string | null;
};
export type OrderKind = "order_sims" | "sell_stock";

export type Order = {
  id: string;
  skuName: string;
  quantity: number;
  logistics: string;
  destination: string | null;
  status: OrderStatus;
  createdAt: string;
  kind: OrderKind;
  createdBy: string | null;
  poNumber: string | null;
  tenantId?: string;
  tenantName?: string;
};

export function orderKindLabel(kind: OrderKind | string | null | undefined): string {
  if (kind === "sell_stock") return "Sell stock";
  return "Order SIMs";
}

function normalizeOrderKind(value: string | null | undefined, fallback?: {
  status?: string;
  logistics?: string;
}): OrderKind {
  if (value === "sell_stock" || value === "order_sims") return value;
  if (fallback?.status === "Received" || fallback?.logistics === "ATN wholesale") return "sell_stock";
  return "order_sims";
}
export type AuditEvent = { id: string; action: string; detail: string; createdAt: string };
export type UsagePoint = { day: string; mb: number };

const PLATFORM_HOME_NAME = "ATN Platform";

async function ensureListedSuperAdminHomeName(tenantId: string, currentName: string): Promise<string> {
  if (currentName.trim().toLowerCase() !== "my organisation") return currentName;
  await getDB().prepare("UPDATE tenants SET name = ? WHERE id = ?").bind(PLATFORM_HOME_NAME, tenantId).run();
  return PLATFORM_HOME_NAME;
}

/** ATN Platform is not a reseller — strip leftover demo/end-customer rows from the home tenant. */
async function ensurePlatformHasNoCustomers(homeTenantId: string): Promise<void> {
  const db = getDB();
  await db.prepare("UPDATE sims SET customer_id = NULL WHERE tenant_id = ?").bind(homeTenantId).run();
  await db.prepare("DELETE FROM customers WHERE tenant_id = ?").bind(homeTenantId).run();
}

export async function getOrCreatePortalContext(email: string): Promise<PortalContext> {
  const db = getDB();
  const listed = await isListedSuperAdmin(email);
  const tenantsHaveActive = await portalTableHasColumn("tenants", "active");
  const member = await db
    .prepare(
      tenantsHaveActive
        ? `SELECT m.email, m.tenant_id, m.role, t.name, IFNULL(t.active, 1) AS active
           FROM tenant_members m JOIN tenants t ON t.id = m.tenant_id
           WHERE m.email = ?`
        : `SELECT m.email, m.tenant_id, m.role, t.name, 1 AS active
           FROM tenant_members m JOIN tenants t ON t.id = m.tenant_id
           WHERE m.email = ?`,
    )
    .bind(email)
    .first<{ email: string; tenant_id: string; role: PortalRole; name: string; active: number }>();

  if (member) {
    if (!member.active && !listed) {
      throw new Error("This organisation has been deactivated. Contact ATN support.");
    }
    const tenantName = listed ? await ensureListedSuperAdminHomeName(member.tenant_id, member.name) : member.name;
    if (listed) await ensurePlatformHasNoCustomers(member.tenant_id);
    return {
      email,
      tenantId: member.tenant_id,
      tenantName,
      homeTenantId: member.tenant_id,
      homeTenantName: tenantName,
      role: listed ? "super_admin" : member.role,
      isSuperAdmin: listed,
    };
  }

  // Invite-only: only listed super admins may bootstrap without a prior invite.
  if (!listed) {
    throw new Error("This email has not been invited to Catalyst.");
  }

  const tenantId = newId("ten");
  const now = new Date().toISOString();
  const tenantName = PLATFORM_HOME_NAME;
  await db
    .prepare("INSERT INTO tenants (id, name, created_at, active) VALUES (?, ?, ?, 1)")
    .bind(tenantId, tenantName, now)
    .run();
  await db
    .prepare("INSERT INTO tenant_members (email, tenant_id, role) VALUES (?, ?, ?)")
    .bind(email, tenantId, "reseller_admin")
    .run();
  return {
    email,
    tenantId,
    tenantName,
    homeTenantId: tenantId,
    homeTenantName: tenantName,
    role: "super_admin",
    isSuperAdmin: true,
  };
}

export async function writeAudit(tenantId: string, actorEmail: string, action: string, detail: string): Promise<void> {
  await getDB()
    .prepare(
      `INSERT INTO audit_events (id, tenant_id, actor_email, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId("aud"), tenantId, actorEmail, action, detail, new Date().toISOString())
    .run();
}

export async function dashboardSummary(tenantId: string) {
  const db = getDB();
  const active = await db
    .prepare("SELECT COUNT(*) as c FROM sims WHERE tenant_id = ? AND state = 'Active'")
    .bind(tenantId)
    .first<{ c: number }>();
  const openOrders = await db
    .prepare("SELECT COUNT(*) as c FROM orders WHERE tenant_id = ? AND status NOT IN ('Received')")
    .bind(tenantId)
    .first<{ c: number }>();
  const pool = await db
    .prepare("SELECT name, cap_mb, used_mb FROM pools WHERE tenant_id = ? ORDER BY created_at LIMIT 1")
    .bind(tenantId)
    .first<{ name: string; cap_mb: number; used_mb: number }>();
  const since = new Date(Date.now() - 86400000).toISOString();
  const activations = await db
    .prepare(
      `SELECT COUNT(*) as c FROM audit_events WHERE tenant_id = ? AND action = 'lifecycle' AND created_at >= ?`,
    )
    .bind(tenantId, since)
    .first<{ c: number }>();
  const usage = await db
    .prepare("SELECT day, mb FROM usage_daily WHERE tenant_id = ? ORDER BY day ASC")
    .bind(tenantId)
    .all<UsagePoint>();
  const activity = await db
    .prepare("SELECT id, action, detail, created_at FROM audit_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 8")
    .bind(tenantId)
    .all<{ id: string; action: string; detail: string; created_at: string }>();

  const cap = pool?.cap_mb ?? 0;
  const used = pool?.used_mb ?? 0;
  return {
    simsActive: active?.c ?? 0,
    poolName: pool?.name ?? "—",
    poolUsedPct: cap ? Math.round((used / cap) * 100) : 0,
    openOrders: openOrders?.c ?? 0,
    activations24h: activations?.c ?? 0,
    usage: (usage.results ?? []).map((row) => ({ day: row.day, mb: row.mb })),
    activity: (activity.results ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      detail: row.detail,
      createdAt: row.created_at,
    })),
  };
}

export async function listSims(tenantId: string, query = ""): Promise<Sim[]> {
  const q = query.trim();
  const sql = `
    SELECT s.id, s.iccid, s.form_factor, s.state, s.customer_id, s.plan_id, s.pool_id, s.wholesale_plan,
           s.platform_plan_id, s.imsi, s.msisdn, s.current_volume_mb,
           c.name as customer_name, p.name as plan_name, pl.name as pool_name,
           pp.name as platform_plan_name, t.name as tenant_name,
           cc.status as cc_status, cc.polled_at as cc_polled_at
    FROM sims s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN plans p ON p.id = s.plan_id
    LEFT JOIN pools pl ON pl.id = s.pool_id
    LEFT JOIN platform_plans pp ON pp.id = s.platform_plan_id
    LEFT JOIN tenants t ON t.id = s.tenant_id
    LEFT JOIN cc_devices cc ON cc.iccid = s.iccid
    WHERE s.tenant_id = ?
      AND (? = '' OR s.iccid LIKE ? OR IFNULL(c.name,'') LIKE ?)
    ORDER BY s.iccid ASC
    LIMIT 200`;
  const like = `%${q.replace(/\s/g, "")}%`;
  const nameLike = `%${q}%`;
  const rows = await getDB().prepare(sql).bind(tenantId, q, like, nameLike).all<{
    id: string;
    iccid: string;
    form_factor: string;
    state: SimState;
    customer_id: string | null;
    plan_id: string | null;
    pool_id: string | null;
    wholesale_plan: string | null;
    platform_plan_id: string | null;
    platform_plan_name: string | null;
    tenant_name: string | null;
    imsi: string | null;
    msisdn: string | null;
    current_volume_mb: number | null;
    customer_name: string | null;
    plan_name: string | null;
    pool_name: string | null;
    cc_status: string | null;
    cc_polled_at: string | null;
  }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    iccid: row.iccid,
    formFactor: row.form_factor,
    state: row.state,
    customerId: row.customer_id,
    customerName: row.customer_name,
    planId: row.plan_id,
    planName: row.plan_name,
    poolId: row.pool_id,
    poolName: row.pool_name,
    wholesalePlan: row.wholesale_plan,
    platformPlanId: row.platform_plan_id,
    platformPlanName: row.platform_plan_name,
    tenantName: row.tenant_name,
    imsi: row.imsi,
    msisdn: row.msisdn,
    currentVolumeMb: row.current_volume_mb,
    ccStatus: row.cc_status,
    ccPolledAt: row.cc_polled_at,
  }));
}

export async function listCustomers(tenantId: string): Promise<Customer[]> {
  const rows = await getDB()
    .prepare("SELECT id, name, created_at FROM customers WHERE tenant_id = ? ORDER BY name")
    .bind(tenantId)
    .all<{ id: string; name: string; created_at: string }>();
  return (rows.results ?? []).map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
}

export async function listPlans(tenantId: string): Promise<Plan[]> {
  const rows = await getDB()
    .prepare(
      `SELECT p.id, p.name, p.type, p.inclusive_mb, p.overage, p.roaming, p.wholesale_plan, p.comm_plan,
              p.platform_plan_id, p.price_per_sim, pp.name as platform_plan_name
       FROM plans p
       LEFT JOIN platform_plans pp ON pp.id = p.platform_plan_id
       WHERE p.tenant_id = ? ORDER BY p.name`,
    )
    .bind(tenantId)
    .all<{
      id: string;
      name: string;
      type: string;
      inclusive_mb: number;
      overage: string;
      roaming: string;
      wholesale_plan: string;
      comm_plan: string;
      platform_plan_id: string | null;
      platform_plan_name: string | null;
      price_per_sim: number | null;
    }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    inclusiveMb: row.inclusive_mb,
    overage: row.overage,
    roaming: row.roaming,
    wholesalePlan: row.wholesale_plan,
    commPlan: row.comm_plan,
    platformPlanId: row.platform_plan_id,
    platformPlanName: row.platform_plan_name,
    pricePerSim: row.price_per_sim,
  }));
}

export async function listPools(tenantId: string): Promise<Pool[]> {
  const rows = await getDB()
    .prepare(
      `SELECT p.id, p.name, p.type, p.cap_mb, p.used_mb,
              (SELECT COUNT(*) FROM sims s WHERE s.pool_id = p.id) as members
       FROM pools p WHERE p.tenant_id = ? ORDER BY p.name`,
    )
    .bind(tenantId)
    .all<{ id: string; name: string; type: string; cap_mb: number; used_mb: number; members: number }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    capMb: row.cap_mb,
    usedMb: row.used_mb,
    members: row.members,
  }));
}

export type OrderFilter = {
  /** Reseller view: only this tenant. */
  scopeTenantId?: string;
  /** Platform view: exclude ATN home tenant (orders live on resellers). */
  excludeTenantId?: string;
  organisationId?: string;
  query?: string;
  status?: string;
  kind?: string;
  skuName?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type OrderFilterOptions = {
  organisations: { id: string; name: string }[];
  statuses: string[];
  kinds: OrderKind[];
  skuNames: string[];
};

export function normalizeOrderFilter(input: OrderFilter): OrderFilter {
  const status = (input.status ?? "").trim();
  const kind = (input.kind ?? "").trim();
  return {
    scopeTenantId: input.scopeTenantId?.trim() || undefined,
    excludeTenantId: input.excludeTenantId?.trim() || undefined,
    organisationId: input.organisationId?.trim() || undefined,
    query: (input.query ?? "").trim() || undefined,
    status: status || undefined,
    kind: kind === "sell_stock" || kind === "order_sims" ? kind : undefined,
    skuName: (input.skuName ?? "").trim() || undefined,
    dateFrom: parseYmd(input.dateFrom)?.key,
    dateTo: parseYmd(input.dateTo)?.key,
  };
}

export function orderFilterActive(filter: OrderFilter): boolean {
  return Boolean(
    filter.organisationId ||
      filter.query ||
      filter.status ||
      filter.kind ||
      filter.skuName ||
      filter.dateFrom ||
      filter.dateTo,
  );
}

function orderFilterSql(filter: OrderFilter): { where: string; binds: unknown[] } {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (filter.scopeTenantId) {
    clauses.push("o.tenant_id = ?");
    binds.push(filter.scopeTenantId);
  } else if (filter.excludeTenantId) {
    clauses.push("o.tenant_id != ?");
    binds.push(filter.excludeTenantId);
  }
  if (filter.organisationId) {
    clauses.push("o.tenant_id = ?");
    binds.push(filter.organisationId);
  }
  if (filter.status) {
    clauses.push("o.status = ?");
    binds.push(filter.status);
  }
  if (filter.kind) {
    clauses.push("o.kind = ?");
    binds.push(filter.kind);
  }
  if (filter.skuName) {
    clauses.push("o.sku_name = ?");
    binds.push(filter.skuName);
  }
  if (filter.query) {
    const like = `%${filter.query}%`;
    clauses.push(
      `(o.id LIKE ? OR o.sku_name LIKE ? OR o.logistics LIKE ? OR IFNULL(o.destination, '') LIKE ? OR IFNULL(t.name, '') LIKE ? OR IFNULL(o.created_by, '') LIKE ? OR IFNULL(o.po_number, '') LIKE ?)`,
    );
    binds.push(like, like, like, like, like, like, like);
  }
  const fromIso = filter.dateFrom ? sydneyDayStartIso(filter.dateFrom) : null;
  const toExclusive = filter.dateTo ? sydneyDayEndExclusiveIso(filter.dateTo) : null;
  if (fromIso) {
    clauses.push("o.created_at >= ?");
    binds.push(fromIso);
  }
  if (toExclusive) {
    clauses.push("o.created_at < ?");
    binds.push(toExclusive);
  }
  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    binds,
  };
}

function mapOrderRow(row: {
  id: string;
  sku_name: string;
  quantity: number;
  logistics: string;
  destination: string | null;
  status: OrderStatus;
  created_at: string;
  kind: string | null;
  created_by: string | null;
  po_number: string | null;
  tenant_id: string;
  tenant_name: string | null;
}): Order {
  return {
    id: row.id,
    skuName: row.sku_name,
    quantity: row.quantity,
    logistics: row.logistics,
    destination: row.destination,
    status: row.status,
    createdAt: row.created_at,
    kind: normalizeOrderKind(row.kind, { status: row.status, logistics: row.logistics }),
    createdBy: row.created_by?.trim() || null,
    poNumber: row.po_number?.trim() || null,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name ?? undefined,
  };
}

export async function listOrders(filter: OrderFilter): Promise<Order[]> {
  const normalized = normalizeOrderFilter(filter);
  const { where, binds } = orderFilterSql(normalized);
  const rows = await getDB()
    .prepare(
      `SELECT o.id, o.sku_name, o.quantity, o.logistics, o.destination, o.status, o.created_at,
              o.kind, o.created_by, o.po_number, o.tenant_id, t.name as tenant_name
       FROM orders o
       LEFT JOIN tenants t ON t.id = o.tenant_id
       ${where}
       ORDER BY o.created_at DESC`,
    )
    .bind(...binds)
    .all<{
      id: string;
      sku_name: string;
      quantity: number;
      logistics: string;
      destination: string | null;
      status: OrderStatus;
      created_at: string;
      kind: string | null;
      created_by: string | null;
      po_number: string | null;
      tenant_id: string;
      tenant_name: string | null;
    }>();
  return (rows.results ?? []).map(mapOrderRow);
}

export async function listOrderFilterOptions(filter: {
  scopeTenantId?: string;
  excludeTenantId?: string;
}): Promise<OrderFilterOptions> {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (filter.scopeTenantId) {
    clauses.push("o.tenant_id = ?");
    binds.push(filter.scopeTenantId);
  } else if (filter.excludeTenantId) {
    clauses.push("o.tenant_id != ?");
    binds.push(filter.excludeTenantId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const db = getDB();
  const [orgs, statuses, kinds, skus] = await Promise.all([
    db
      .prepare(
        `SELECT DISTINCT o.tenant_id as id, t.name as name
         FROM orders o
         LEFT JOIN tenants t ON t.id = o.tenant_id
         ${where}
         ORDER BY t.name ASC`,
      )
      .bind(...binds)
      .all<{ id: string; name: string | null }>(),
    db
      .prepare(
        `SELECT DISTINCT o.status as status FROM orders o ${where} ORDER BY o.status ASC`,
      )
      .bind(...binds)
      .all<{ status: string }>(),
    db
      .prepare(
        `SELECT DISTINCT o.kind as kind FROM orders o ${where} ORDER BY o.kind ASC`,
      )
      .bind(...binds)
      .all<{ kind: string | null }>(),
    db
      .prepare(
        `SELECT DISTINCT o.sku_name as sku_name FROM orders o ${where} ORDER BY o.sku_name ASC`,
      )
      .bind(...binds)
      .all<{ sku_name: string }>(),
  ]);
  const kindSet = new Set<OrderKind>();
  for (const row of kinds.results ?? []) {
    if (row.kind === "sell_stock" || row.kind === "order_sims") kindSet.add(row.kind);
  }
  if (kindSet.size === 0) {
    kindSet.add("order_sims");
    kindSet.add("sell_stock");
  }
  return {
    organisations: (orgs.results ?? [])
      .filter((row) => row.id)
      .map((row) => ({ id: row.id, name: row.name?.trim() || row.id })),
    statuses: (statuses.results ?? []).map((row) => row.status).filter(Boolean),
    kinds: [...kindSet],
    skuNames: (skus.results ?? []).map((row) => row.sku_name).filter(Boolean),
  };
}

export async function listUsage(tenantId: string): Promise<UsagePoint[]> {
  const rows = await getDB()
    .prepare("SELECT day, mb FROM usage_daily WHERE tenant_id = ? ORDER BY day ASC")
    .bind(tenantId)
    .all<UsagePoint>();
  return rows.results ?? [];
}

export async function listAudit(tenantId: string): Promise<AuditEvent[]> {
  const rows = await getDB()
    .prepare("SELECT id, action, detail, created_at FROM audit_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 40")
    .bind(tenantId)
    .all<{ id: string; action: string; detail: string; created_at: string }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

export async function createCustomer(
  tenantId: string,
  actorEmail: string,
  name: string,
  homeTenantId?: string,
): Promise<Customer> {
  if (homeTenantId && tenantId === homeTenantId) {
    throw new Error("Customers belong to reseller organisations, not ATN Platform.");
  }
  const id = newId("cus");
  const now = new Date().toISOString();
  await getDB()
    .prepare("INSERT INTO customers (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, tenantId, name, now)
    .run();
  await writeAudit(tenantId, actorEmail, "customer", `Customer ${name} created`);
  return { id, name, createdAt: now };
}

export async function createPlan(
  tenantId: string,
  actorEmail: string,
  input: {
    name: string;
    platformPlanId: string;
    inclusiveMb: number;
    pricePerSim: number;
  },
): Promise<Plan> {
  const allowed = await tenantHasPlatformPlan(tenantId, input.platformPlanId);
  if (!allowed) throw new Error("This organisation is not contracted for that plan.");
  const parent = await loadPlatformPlanRecord(input.platformPlanId);
  if (!parent) throw new Error("Plan not found.");
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Enter a retail plan name.");
  const inclusiveMb = Number(input.inclusiveMb);
  if (!inclusiveMb || inclusiveMb < 1) throw new Error("Enter data allowance per SIM.");
  const pricePerSim = Number(input.pricePerSim);
  if (Number.isNaN(pricePerSim) || pricePerSim < 0) throw new Error("Enter price per SIM.");

  const id = newId("plan");
  await getDB()
    .prepare(
      `INSERT INTO plans (id, tenant_id, name, type, inclusive_mb, overage, roaming, wholesale_plan, comm_plan, platform_plan_id, price_per_sim, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      tenantId,
      name,
      "Retail",
      inclusiveMb,
      "throttle",
      "AU/NZ",
      parent.cc_rate_plan,
      parent.comm_plan,
      parent.id,
      pricePerSim,
      new Date().toISOString(),
    )
    .run();
  await writeAudit(tenantId, actorEmail, "plan", `Retail plan ${name} copied from ${parent.name}`);
  return {
    id,
    name,
    type: "Retail",
    inclusiveMb,
    overage: "throttle",
    roaming: "AU/NZ",
    wholesalePlan: parent.cc_rate_plan,
    commPlan: parent.comm_plan,
    platformPlanId: parent.id,
    platformPlanName: parent.name,
    pricePerSim,
  };
}

export async function createPool(
  tenantId: string,
  actorEmail: string,
  input: { name: string; type: string; capMb: number },
): Promise<Pool> {
  const id = newId("pool");
  await getDB()
    .prepare("INSERT INTO pools (id, tenant_id, name, type, cap_mb, used_mb, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)")
    .bind(id, tenantId, input.name, input.type, input.capMb, new Date().toISOString())
    .run();
  await writeAudit(tenantId, actorEmail, "pool", `Pool ${input.name} created`);
  return { id, name: input.name, type: input.type, capMb: input.capMb, usedMb: 0, members: 0 };
}

function normalizePoNumber(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > 64) throw new Error("PO number must be 64 characters or fewer.");
  return trimmed;
}

/**
 * Cancel / delete an Order SIMs row.
 * - Submitted: reseller admin (own org) or super admin
 * - Accepted / Shipped / Received / Draft: super admin only
 * Sell stock cannot be cancelled here.
 */
export async function cancelOrderSims(
  actor: { email: string; role: PortalRole; tenantId: string; homeTenantId: string; isSuperAdmin: boolean },
  orderId: string,
): Promise<void> {
  const row = await getDB()
    .prepare(
      `SELECT id, tenant_id, sku_name, quantity, status, kind, created_by
       FROM orders WHERE id = ?`,
    )
    .bind(orderId)
    .first<{
      id: string;
      tenant_id: string;
      sku_name: string;
      quantity: number;
      status: OrderStatus;
      kind: string | null;
      created_by: string | null;
    }>();
  if (!row) throw new Error("Order not found.");

  const kind = normalizeOrderKind(row.kind, { status: row.status });
  if (kind !== "order_sims") {
    throw new Error("Only Order SIMs requests can be cancelled. Sell stock cannot be deleted here.");
  }

  const isSuperAdminActor = actor.isSuperAdmin && actor.role === "super_admin";
  const submitted = row.status === "Submitted" || row.status === "Draft";

  if (submitted) {
    if (!isSuperAdminActor && row.tenant_id !== actor.tenantId) {
      throw new Error("You can only revoke orders for your organisation.");
    }
  } else if (!isSuperAdminActor) {
    throw new Error("Only a super admin can cancel an order after it is Accepted.");
  }

  await getDB().prepare("DELETE FROM orders WHERE id = ?").bind(orderId).run();
  const verb = submitted ? "Revoked" : "Cancelled";
  await writeAudit(
    row.tenant_id,
    actor.email,
    "order",
    `${verb} ${row.status} order ${row.sku_name} × ${row.quantity} (${orderId.slice(-8)})`,
  );
}

export async function createOrder(
  tenantId: string,
  actor: { email: string; role: PortalRole },
  input: { skuId: string; quantity: number; logistics: string; destination?: string; poNumber?: string },
): Promise<Order> {
  const sku = await getSimSku(input.skuId);
  if (!sku) throw new Error("Unknown catalogue item.");
  if (!sku.active) throw new Error("This catalogue SKU is deactivated.");
  // Resellers may only order SKUs bound on their Contract. Super admin sees the full catalogue.
  if (actor.role !== "super_admin") {
    const allowed = await tenantHasSku(tenantId, sku.id);
    if (!allowed) {
      throw new Error("This catalogue SKU is not on your contract. Ask ATN to bind it first.");
    }
  }
  if (input.quantity < 1 || input.quantity > 5000) throw new Error("Quantity must be between 1 and 5,000.");
  const poNumber = normalizePoNumber(input.poNumber);

  const id = newId("ord");
  const now = new Date().toISOString();
  await getDB()
    .prepare(
      `INSERT INTO orders (id, tenant_id, sku_id, sku_name, quantity, logistics, destination, status, created_at, kind, created_by, po_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Submitted', ?, 'order_sims', ?, ?)`,
    )
    .bind(
      id,
      tenantId,
      sku.id,
      sku.name,
      input.quantity,
      input.logistics,
      input.destination ?? input.logistics,
      now,
      actor.email,
      poNumber,
    )
    .run();

  const job = await runCcMutation({
    tenantId,
    kind: "order.accept",
    payload: { orderId: id, sku: sku.id, quantity: input.quantity },
    correlationId: `order-${id}`,
  });
  if (job.status === "failed") {
    throw new Error(job.error ?? "Control Center rejected the order.");
  }

  await writeAudit(tenantId, actor.email, "order", `Order ${sku.name} × ${input.quantity} submitted`);
  return {
    id,
    skuName: sku.name,
    quantity: input.quantity,
    logistics: input.logistics,
    destination: input.destination ?? input.logistics,
    status: "Submitted",
    createdAt: now,
    kind: "order_sims",
    createdBy: actor.email,
    poNumber,
    tenantId,
  };
}

/** Form-factor stamp for warehouse SIMs — not a stock filter. Prefer contract catalogue, then tenant default. */
async function resolveSellStockSku(tenantId: string, preferredSkuId?: string | null) {
  const contractSkus = (await listResellerSkus(tenantId)).filter((sku) => sku.active);
  if (preferredSkuId) {
    const preferred = contractSkus.find((sku) => sku.skuId === preferredSkuId);
    if (preferred) {
      const sku = await getSimSku(preferred.skuId);
      if (sku?.active) return sku;
    }
  }
  const tenant = await loadTenant(tenantId);
  if (tenant?.ccDefaultSkuId) {
    const fromDefault = contractSkus.find((sku) => sku.skuId === tenant.ccDefaultSkuId);
    if (fromDefault) {
      const sku = await getSimSku(fromDefault.skuId);
      if (sku?.active) return sku;
    }
    const legacy = await getSimSku(tenant.ccDefaultSkuId);
    if (legacy?.active) return legacy;
  }
  if (contractSkus[0]) {
    const sku = await getSimSku(contractSkus[0].skuId);
    if (sku?.active) return sku;
  }
  const anyActive = (await listSimSkus({ activeOnly: true }))[0];
  if (anyActive) return anyActive;
  throw new Error(
    "No catalogue SKU available to stamp warehouse form factor. Create a Catalogue SKU and bind it on Contract.",
  );
}

export async function allocateWholesaleStock(
  actor: { email: string; isSuperAdmin: boolean; role: PortalRole },
  input: {
    tenantId: string;
    /** Optional; otherwise resolved from contract / tenant default. */
    skuId?: string;
    platformPlanId: string;
    /** Jasper Control Center Customer field — required for sell stock. */
    ccCustomer: string;
    poNumber?: string;
  },
): Promise<Order> {
  if (!actor.isSuperAdmin || actor.role !== "super_admin") {
    throw new Error("Only a super admin can sell stock into a reseller warehouse.");
  }
  const tenant = await loadTenant(input.tenantId);
  if (!tenant) throw new Error("Organisation not found.");
  const sku = await resolveSellStockSku(tenant.id, input.skuId);
  const platformPlan = await loadPlatformPlanRecord(input.platformPlanId);
  if (!platformPlan) throw new Error("Plan not found.");
  if (!platformPlan.active) throw new Error("This plan is deactivated.");
  const contracted = await tenantHasPlatformPlan(tenant.id, platformPlan.id);
  if (!contracted) throw new Error("Assign this plan to the reseller (contract) before selling stock.");

  const ccCustomer = input.ccCustomer.trim();
  if (!ccCustomer) {
    throw new Error(
      "Choose the Control Center customer name (set on SIMs in Jasper, then synced into the snapshot).",
    );
  }
  if (tenant.ccCustomer && tenant.ccCustomer.toLowerCase() !== ccCustomer.toLowerCase()) {
    throw new Error(
      `This reseller is bound to Control Center customer “${tenant.ccCustomer}”. Sell stock for that customer only.`,
    );
  }
  const taken = await findTenantByCcCustomer(ccCustomer);
  if (taken && taken.id !== tenant.id) {
    throw new Error(`Control Center customer “${ccCustomer}” is already bound to ${taken.name}.`);
  }

  const adminEmail = await getResellerAdminEmail(tenant.id);
  if (!adminEmail) {
    throw new Error("Invite a reseller admin for this organisation before selling stock.");
  }

  const devices = await listCcDevicesForCustomer(ccCustomer);
  if (devices.length === 0) {
    throw new Error(
      `No SIMs in the Control Center copy for customer “${ccCustomer}”. Set Customer in Jasper, Sync, then try again.`,
    );
  }

  await bindTenantCcCustomer(tenant.id, ccCustomer, adminEmail, {
    skuId: sku.id,
    platformPlanId: platformPlan.id,
  });

  const id = newId("ord");
  const now = new Date().toISOString();
  const logistics = "ATN wholesale";
  const destination = `CC ${ccCustomer} · ${platformPlan.name}`;
  const poNumber = normalizePoNumber(input.poNumber);

  await getDB()
    .prepare(
      `INSERT INTO orders (id, tenant_id, sku_id, sku_name, quantity, logistics, destination, status, created_at, kind, created_by, po_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Received', ?, 'sell_stock', ?, ?)`,
    )
    .bind(id, tenant.id, sku.id, sku.name, devices.length, logistics, destination, now, actor.email, poNumber)
    .run();

  const job = await runCcMutation({
    tenantId: tenant.id,
    kind: "wholesale.allocate",
    payload: {
      orderId: id,
      sku: sku.id,
      quantity: devices.length,
      platformPlanId: platformPlan.id,
      wholesalePlan: platformPlan.cc_rate_plan,
      commPlan: platformPlan.comm_plan,
      ccCustomer,
      boundAdminEmail: adminEmail,
      iccids: devices.map((device) => device.iccid),
    },
    correlationId: `wholesale-${id}`,
  });
  if (job.status === "failed") {
    throw new Error(job.error ?? "Control Center rejected the wholesale allocation.");
  }

  const result = await materializeWarehouseForCcCustomer({
    tenantId: tenant.id,
    ccCustomer,
    formFactor: sku.formFactor,
    platformPlanId: platformPlan.id,
    orderId: id,
  });

  await writeAudit(
    tenant.id,
    actor.email,
    "wholesale",
    `Sold ${sku.name} · ${result.inserted.toLocaleString("en-AU")} new / ${result.total.toLocaleString("en-AU")} total SIMs to ${tenant.name} on ${platformPlan.name} · CC customer ${ccCustomer} · bound ${adminEmail}`,
  );
  return {
    id,
    skuName: sku.name,
    quantity: result.total,
    logistics,
    destination,
    status: "Received",
    createdAt: now,
    kind: "sell_stock",
    createdBy: actor.email,
    poNumber,
    tenantId: tenant.id,
    tenantName: tenant.name,
  };
}

export async function assignSims(
  tenantId: string,
  actorEmail: string,
  input: { customerId: string; planId: string; poolId?: string; iccids: string[] },
): Promise<{ assigned: number }> {
  const db = getDB();
  const customer = await db
    .prepare("SELECT id, name FROM customers WHERE id = ? AND tenant_id = ?")
    .bind(input.customerId, tenantId)
    .first<{ id: string; name: string }>();
  const plan = await db
    .prepare("SELECT id, name, wholesale_plan, comm_plan, platform_plan_id FROM plans WHERE id = ? AND tenant_id = ?")
    .bind(input.planId, tenantId)
    .first<{ id: string; name: string; wholesale_plan: string; comm_plan: string; platform_plan_id: string | null }>();
  if (!customer || !plan) throw new Error("Customer or plan not found in this tenant.");
  if (!plan.platform_plan_id) throw new Error("Choose a retail plan copied from a contracted plan.");
  let poolId: string | null = null;
  if (input.poolId) {
    const pool = await db
      .prepare("SELECT id FROM pools WHERE id = ? AND tenant_id = ?")
      .bind(input.poolId, tenantId)
      .first<{ id: string }>();
    if (!pool) throw new Error("Pool not found in this tenant.");
    poolId = pool.id;
  }

  const iccids = input.iccids.map((value) => value.replace(/\s/g, "")).filter(Boolean);
  if (iccids.length === 0) throw new Error("Select at least one SIM.");

  const contracted = await tenantHasPlatformPlan(tenantId, plan.platform_plan_id);
  if (!contracted) {
    throw new Error("That retail plan’s rate plan is not on this organisation’s contract.");
  }

  // Dynamic import avoids a circular dependency with rate-plan-change → writeAudit.
  const { changeSimRatePlan } = await import("@/lib/portal/rate-plan-change");

  // Portal-only end customer. Retail plan may retarget the SIM onto any contracted rate plan
  // (same rules as Plan changes when the warehouse default differs).
  let ratePlanChanges = 0;
  for (const iccid of iccids) {
    const sim = await db
      .prepare("SELECT platform_plan_id FROM sims WHERE tenant_id = ? AND iccid = ?")
      .bind(tenantId, iccid)
      .first<{ platform_plan_id: string | null }>();
    if (!sim) throw new Error(`SIM ${iccid} is not in this tenant.`);

    if (sim.platform_plan_id !== plan.platform_plan_id) {
      try {
        await changeSimRatePlan(tenantId, actorEmail, {
          iccid,
          platformPlanId: plan.platform_plan_id,
        });
        ratePlanChanges += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Rate plan change failed.";
        throw new Error(`SIM ${iccid}: ${message}`);
      }
    }

    const result = await db
      .prepare(
        `UPDATE sims
         SET customer_id = ?, plan_id = ?, pool_id = ?, state = CASE WHEN state = 'Ready' THEN 'Ready' ELSE state END
         WHERE tenant_id = ? AND iccid = ?`,
      )
      .bind(customer.id, plan.id, poolId, tenantId, iccid)
      .run();
    if ((result.meta.changes ?? 0) === 0) throw new Error(`SIM ${iccid} is not in this tenant.`);
  }

  await writeAudit(
    tenantId,
    actorEmail,
    "assign",
    `${customer.name} · ${iccids.length} SIMs · ${plan.name}${
      ratePlanChanges ? ` · ${ratePlanChanges} rate plan change${ratePlanChanges === 1 ? "" : "s"}` : ""
    }${poolId ? " · pool" : ""}`,
  );
  return { assigned: iccids.length };
}

export async function applyLifecycle(
  tenantId: string,
  actorEmail: string,
  input: { iccid: string; action: string },
): Promise<SimState> {
  const db = getDB();
  const iccid = input.iccid.replace(/\s/g, "");
  const sim = await db
    .prepare("SELECT id, state FROM sims WHERE tenant_id = ? AND iccid = ?")
    .bind(tenantId, iccid)
    .first<{ id: string; state: SimState }>();
  if (!sim) throw new Error("SIM not found in this tenant.");
  const next = lifecycleTarget(input.action, sim.state);
  if (!next) throw new Error(`${input.action} is not valid from ${sim.state}.`);

  const job = await runCcMutation({
    tenantId,
    kind: "lifecycle",
    payload: { iccid, action: input.action, from: sim.state, to: next },
    correlationId: `life-${iccid}-${input.action}-${sim.state}`,
  });
  if (job.status === "failed") throw new Error(job.error ?? "Control Center lifecycle failed.");

  await db.prepare("UPDATE sims SET state = ? WHERE id = ? AND tenant_id = ?").bind(next, sim.id, tenantId).run();
  await writeAudit(tenantId, actorEmail, "lifecycle", `${input.action} ${iccid} → ${next}`);
  return next;
}

export async function addPoolMembers(tenantId: string, actorEmail: string, poolId: string, iccids: string[]): Promise<number> {
  const pool = await getDB()
    .prepare("SELECT id, name FROM pools WHERE id = ? AND tenant_id = ?")
    .bind(poolId, tenantId)
    .first<{ id: string; name: string }>();
  if (!pool) throw new Error("Pool not found in this tenant.");
  let n = 0;
  for (const raw of iccids) {
    const iccid = raw.replace(/\s/g, "");
    const result = await getDB()
      .prepare("UPDATE sims SET pool_id = ? WHERE tenant_id = ? AND iccid = ?")
      .bind(poolId, tenantId, iccid)
      .run();
    if (result.meta.changes) n += 1;
  }
  await writeAudit(tenantId, actorEmail, "pool", `Added ${n} SIMs to ${pool.name}`);
  return n;
}

export async function renameTenant(tenantId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error("Enter an organisation name.");
  await getDB().prepare("UPDATE tenants SET name = ? WHERE id = ?").bind(trimmed, tenantId).run();
}
