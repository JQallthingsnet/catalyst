import { getDB } from "@/lib/env";
import { runCcMutation } from "@/lib/cc/adapter";
import { pickAvailableCcDevices } from "@/lib/cc/devices";
import { lifecycleTarget, type OrderStatus, type SimState } from "@/lib/portal/catalogue";
import { getSimSku } from "@/lib/portal/skus";
import { loadPlatformPlanRecord, tenantHasPlatformPlan } from "@/lib/portal/platform-plans";
import { loadTenant } from "@/lib/portal/tenant";
import { newId } from "@/lib/portal/ids";
import { type PortalRole } from "@/lib/portal/role-model";
import { isListedSuperAdmin } from "@/lib/portal/roles";

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
export type Order = {
  id: string;
  skuName: string;
  quantity: number;
  logistics: string;
  destination: string | null;
  status: OrderStatus;
  createdAt: string;
  tenantId?: string;
  tenantName?: string;
};
export type AuditEvent = { id: string; action: string; detail: string; createdAt: string };
export type UsagePoint = { day: string; mb: number };

const PLATFORM_HOME_NAME = "ATN Platform";

async function ensureListedSuperAdminHomeName(tenantId: string, currentName: string): Promise<string> {
  if (currentName.trim().toLowerCase() !== "my organisation") return currentName;
  await getDB().prepare("UPDATE tenants SET name = ? WHERE id = ?").bind(PLATFORM_HOME_NAME, tenantId).run();
  return PLATFORM_HOME_NAME;
}

export async function getOrCreatePortalContext(email: string): Promise<PortalContext> {
  const db = getDB();
  const listed = await isListedSuperAdmin(email);
  const member = await db
    .prepare(
      `SELECT m.email, m.tenant_id, m.role, t.name
       FROM tenant_members m JOIN tenants t ON t.id = m.tenant_id
       WHERE m.email = ?`,
    )
    .bind(email)
    .first<{ email: string; tenant_id: string; role: PortalRole; name: string }>();

  if (member) {
    const tenantName = listed ? await ensureListedSuperAdminHomeName(member.tenant_id, member.name) : member.name;
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

  const tenantId = newId("ten");
  const now = new Date().toISOString();
  const tenantName = listed ? PLATFORM_HOME_NAME : "My organisation";
  await db.prepare("INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)").bind(tenantId, tenantName, now).run();
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
    role: listed ? "super_admin" : "reseller_admin",
    isSuperAdmin: listed,
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

export async function listOrders(tenantId: string): Promise<Order[]> {
  const rows = await getDB()
    .prepare(
      `SELECT id, sku_name, quantity, logistics, destination, status, created_at
       FROM orders WHERE tenant_id = ? ORDER BY created_at DESC`,
    )
    .bind(tenantId)
    .all<{
      id: string;
      sku_name: string;
      quantity: number;
      logistics: string;
      destination: string | null;
      status: OrderStatus;
      created_at: string;
    }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    skuName: row.sku_name,
    quantity: row.quantity,
    logistics: row.logistics,
    destination: row.destination,
    status: row.status,
    createdAt: row.created_at,
  }));
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

export async function createCustomer(tenantId: string, actorEmail: string, name: string): Promise<Customer> {
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

export async function createOrder(
  tenantId: string,
  actorEmail: string,
  input: { skuId: string; quantity: number; logistics: string; destination?: string },
): Promise<Order> {
  const sku = await getSimSku(input.skuId);
  if (!sku) throw new Error("Unknown catalogue item.");
  if (input.quantity < 1 || input.quantity > 5000) throw new Error("Quantity must be between 1 and 5,000.");

  const id = newId("ord");
  const now = new Date().toISOString();
  await getDB()
    .prepare(
      `INSERT INTO orders (id, tenant_id, sku_id, sku_name, quantity, logistics, destination, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Submitted', ?)`,
    )
    .bind(id, tenantId, sku.id, sku.name, input.quantity, input.logistics, input.destination ?? input.logistics, now)
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

  await writeAudit(tenantId, actorEmail, "order", `Order ${sku.name} × ${input.quantity} submitted`);
  return {
    id,
    skuName: sku.name,
    quantity: input.quantity,
    logistics: input.logistics,
    destination: input.destination ?? input.logistics,
    status: "Submitted",
    createdAt: now,
  };
}

export async function allocateWholesaleStock(
  actor: { email: string; isSuperAdmin: boolean; role: PortalRole },
  input: { tenantId: string; skuId: string; quantity: number; platformPlanId: string },
): Promise<Order> {
  if (!actor.isSuperAdmin || actor.role !== "super_admin") {
    throw new Error("Only a super admin can sell stock into a reseller warehouse.");
  }
  const tenant = await loadTenant(input.tenantId);
  if (!tenant) throw new Error("Organisation not found.");
  const sku = await getSimSku(input.skuId);
  if (!sku) throw new Error("Unknown catalogue item.");
  const platformPlan = await loadPlatformPlanRecord(input.platformPlanId);
  if (!platformPlan) throw new Error("Plan not found.");
  const contracted = await tenantHasPlatformPlan(tenant.id, platformPlan.id);
  if (!contracted) throw new Error("Assign this plan to the reseller (contract) before selling stock.");
  if (input.quantity < 1 || input.quantity > 5000) throw new Error("Quantity must be between 1 and 5,000.");

  const devices = await pickAvailableCcDevices(platformPlan.cc_rate_plan, platformPlan.comm_plan, input.quantity);
  if (devices.length < input.quantity) {
    if (devices.length === 0) {
      throw new Error(
        `No free SIMs in the Control Center copy for ${platformPlan.name} (CC ${platformPlan.cc_rate_plan} · ${platformPlan.comm_plan}). Poll CC first, or they are already in a warehouse.`,
      );
    }
    throw new Error(
      `Only ${devices.length.toLocaleString("en-AU")} free SIM${devices.length === 1 ? "" : "s"} on ${platformPlan.name} in Control Center. Reduce quantity to ${devices.length}.`,
    );
  }

  const id = newId("ord");
  const now = new Date().toISOString();
  const logistics = "ATN wholesale";
  const destination = platformPlan.name;

  await getDB()
    .prepare(
      `INSERT INTO orders (id, tenant_id, sku_id, sku_name, quantity, logistics, destination, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Received', ?)`,
    )
    .bind(id, tenant.id, sku.id, sku.name, input.quantity, logistics, destination, now)
    .run();

  const job = await runCcMutation({
    tenantId: tenant.id,
    kind: "wholesale.allocate",
    payload: {
      orderId: id,
      sku: sku.id,
      quantity: input.quantity,
      platformPlanId: platformPlan.id,
      wholesalePlan: platformPlan.cc_rate_plan,
      commPlan: platformPlan.comm_plan,
      iccids: devices.map((device) => device.iccid),
    },
    correlationId: `wholesale-${id}`,
  });
  if (job.status === "failed") {
    throw new Error(job.error ?? "Control Center rejected the wholesale allocation.");
  }

  const dbInsert = getDB();
  const inserts = devices.map((device) =>
    dbInsert
      .prepare(
        `INSERT INTO sims (id, tenant_id, iccid, form_factor, state, customer_id, plan_id, pool_id, order_id, wholesale_plan, platform_plan_id, created_at, imsi, msisdn, current_volume_mb, cc_status, cc_polled_at)
         VALUES (?, ?, ?, ?, 'Ready', NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId("sim"),
        tenant.id,
        device.iccid,
        sku.formFactor,
        id,
        platformPlan.cc_rate_plan,
        platformPlan.id,
        now,
        device.imsi,
        device.msisdn,
        device.ctdUsageMb,
        device.status,
        now,
      ),
  );
  try {
    for (let i = 0; i < inserts.length; i += 40) {
      await dbInsert.batch(inserts.slice(i, i + 40));
    }
  } catch {
    throw new Error("A SIM was taken by another sale. Try again.");
  }

  await writeAudit(
    tenant.id,
    actor.email,
    "wholesale",
    `Sold ${sku.name} × ${input.quantity} to ${tenant.name} on ${platformPlan.name}`,
  );
  return {
    id,
    skuName: sku.name,
    quantity: input.quantity,
    logistics,
    destination,
    status: "Received",
    createdAt: now,
    tenantId: tenant.id,
    tenantName: tenant.name,
  };
}

export async function assignSims(
  tenantId: string,
  actorEmail: string,
  input: { customerId: string; planId: string; poolId?: string; iccids: string[] },
): Promise<{ assigned: number; correlationId: string }> {
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
  if (!plan.platform_plan_id) throw new Error("Choose a retail plan copied from a contracted ATN plan.");
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

  const job = await runCcMutation({
    tenantId,
    kind: "assign",
    payload: {
      customerId: customer.id,
      planId: plan.id,
      wholesalePlan: plan.wholesale_plan,
      commPlan: plan.comm_plan,
      poolId,
      iccids,
    },
    correlationId: `assign-${customer.id}-${iccids[0]}-${iccids.length}`,
  });
  if (job.status === "failed") throw new Error(job.error ?? "Control Center assign failed.");

  for (const iccid of iccids) {
    const sim = await db
      .prepare("SELECT platform_plan_id FROM sims WHERE tenant_id = ? AND iccid = ?")
      .bind(tenantId, iccid)
      .first<{ platform_plan_id: string | null }>();
    if (!sim) throw new Error(`SIM ${iccid} is not in this tenant.`);
    if (!sim.platform_plan_id || sim.platform_plan_id !== plan.platform_plan_id) {
      throw new Error(`SIM ${iccid} is not on the ATN plan this retail plan was copied from.`);
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
    `${customer.name} · ${iccids.length} SIMs · ${plan.name}${poolId ? " · pool" : ""}`,
  );
  return { assigned: iccids.length, correlationId: job.correlationId };
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
  await getDB().prepare("UPDATE tenants SET name = ? WHERE id = ?").bind(name, tenantId).run();
}
