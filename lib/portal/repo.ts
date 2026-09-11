import { getDB } from "@/lib/env";
import { runCcMutation } from "@/lib/cc/adapter";
import { lifecycleTarget, skuById, type OrderStatus, type SimState } from "@/lib/portal/catalogue";
import { newId, padIccid } from "@/lib/portal/ids";
import { seedTenantDemo } from "@/lib/portal/seed";
import { type PortalRole } from "@/lib/portal/role-model";

export type { PortalRole };

export type PortalContext = {
  email: string;
  tenantId: string;
  tenantName: string;
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
};
export type Order = {
  id: string;
  skuName: string;
  quantity: number;
  logistics: string;
  destination: string | null;
  status: OrderStatus;
  createdAt: string;
};
export type AuditEvent = { id: string; action: string; detail: string; createdAt: string };
export type UsagePoint = { day: string; mb: number };

async function nextIccidSeed(tenantId: string): Promise<number> {
  const row = await getDB()
    .prepare("SELECT COUNT(*) as c FROM sims WHERE tenant_id = ?")
    .bind(tenantId)
    .first<{ c: number }>();
  return (row?.c ?? 0) + 1;
}

export async function getOrCreatePortalContext(email: string): Promise<PortalContext> {
  const db = getDB();
  const member = await db
    .prepare(
      `SELECT m.email, m.tenant_id, m.role, t.name
       FROM tenant_members m JOIN tenants t ON t.id = m.tenant_id
       WHERE m.email = ? LIMIT 1`,
    )
    .bind(email)
    .first<{ email: string; tenant_id: string; role: PortalRole; name: string }>();

  if (member) {
    return {
      email,
      tenantId: member.tenant_id,
      tenantName: member.name,
      role: member.role,
      isSuperAdmin: false,
    };
  }

  const tenantId = newId("ten");
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)").bind(tenantId, "Acme MVNO", now).run();
  await db
    .prepare("INSERT INTO tenant_members (email, tenant_id, role) VALUES (?, ?, ?)")
    .bind(email, tenantId, "reseller_admin")
    .run();
  await seedTenantDemo(tenantId, email);
  return { email, tenantId, tenantName: "Acme MVNO", role: "reseller_admin", isSuperAdmin: false };
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
    SELECT s.id, s.iccid, s.form_factor, s.state, s.customer_id, s.plan_id, s.pool_id,
           c.name as customer_name, p.name as plan_name, pl.name as pool_name
    FROM sims s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN plans p ON p.id = s.plan_id
    LEFT JOIN pools pl ON pl.id = s.pool_id
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
    customer_name: string | null;
    plan_name: string | null;
    pool_name: string | null;
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
      `SELECT id, name, type, inclusive_mb, overage, roaming, wholesale_plan, comm_plan
       FROM plans WHERE tenant_id = ? ORDER BY name`,
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
    type: string;
    inclusiveMb: number;
    overage: string;
    roaming: string;
    wholesalePlan: string;
    commPlan: string;
  },
): Promise<Plan> {
  const id = newId("plan");
  await getDB()
    .prepare(
      `INSERT INTO plans (id, tenant_id, name, type, inclusive_mb, overage, roaming, wholesale_plan, comm_plan, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      tenantId,
      input.name,
      input.type,
      input.inclusiveMb,
      input.overage,
      input.roaming,
      input.wholesalePlan,
      input.commPlan,
      new Date().toISOString(),
    )
    .run();
  await writeAudit(tenantId, actorEmail, "plan", `Plan ${input.name} mapped to ${input.wholesalePlan}`);
  return { id, ...input };
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
  const sku = skuById(input.skuId);
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

  await getDB().prepare("UPDATE orders SET status = 'Received' WHERE id = ? AND tenant_id = ?").bind(id, tenantId).run();

  const dbInsert = getDB();
  let n = await nextIccidSeed(tenantId);
  const inserts = [];
  for (let i = 0; i < input.quantity; i += 1) {
    inserts.push(
      dbInsert
        .prepare(
          `INSERT INTO sims (id, tenant_id, iccid, form_factor, state, customer_id, plan_id, pool_id, order_id, created_at)
           VALUES (?, ?, ?, ?, 'Ready', NULL, NULL, NULL, ?, ?)`,
        )
        .bind(newId("sim"), tenantId, padIccid(n), sku.formFactor, id, now),
    );
    n += 1;
  }
  for (let i = 0; i < inserts.length; i += 40) {
    await dbInsert.batch(inserts.slice(i, i + 40));
  }

  await writeAudit(tenantId, actorEmail, "order", `Order ${sku.name} × ${input.quantity} received · ICCIDs reserved`);
  return {
    id,
    skuName: sku.name,
    quantity: input.quantity,
    logistics: input.logistics,
    destination: input.destination ?? input.logistics,
    status: "Received",
    createdAt: now,
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
    .prepare("SELECT id, name, wholesale_plan, comm_plan FROM plans WHERE id = ? AND tenant_id = ?")
    .bind(input.planId, tenantId)
    .first<{ id: string; name: string; wholesale_plan: string; comm_plan: string }>();
  if (!customer || !plan) throw new Error("Customer or plan not found in this tenant.");

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
      poolId: input.poolId ?? null,
      iccids,
    },
    correlationId: `assign-${customer.id}-${iccids[0]}-${iccids.length}`,
  });
  if (job.status === "failed") throw new Error(job.error ?? "Control Center assign failed.");

  for (const iccid of iccids) {
    const result = await db
      .prepare(
        `UPDATE sims
         SET customer_id = ?, plan_id = ?, pool_id = ?, state = CASE WHEN state = 'Ready' THEN 'Ready' ELSE state END
         WHERE tenant_id = ? AND iccid = ?`,
      )
      .bind(customer.id, plan.id, input.poolId ?? null, tenantId, iccid)
      .run();
    if ((result.meta.changes ?? 0) === 0) throw new Error(`SIM ${iccid} is not in this tenant.`);
  }

  await writeAudit(
    tenantId,
    actorEmail,
    "assign",
    `${customer.name} · ${iccids.length} SIMs · ${plan.name}${input.poolId ? " · pool" : ""}`,
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
