import { getDB } from "@/lib/env";
import { runCcMutation } from "@/lib/cc/adapter";
import { newId, padIccid } from "@/lib/portal/ids";

export async function seedTenantDemo(tenantId: string, actorEmail: string): Promise<void> {
  const db = getDB();
  const existing = await db.prepare("SELECT id FROM customers WHERE tenant_id = ? LIMIT 1").bind(tenantId).first();
  if (existing) return;

  const now = new Date().toISOString();
  const customerId = newId("cus");
  const planId = newId("plan");
  const poolId = newId("pool");
  const receivedOrderId = newId("ord");
  const openOrderA = newId("ord");
  const openOrderB = newId("ord");

  await db
    .prepare("INSERT INTO customers (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)")
    .bind(customerId, tenantId, "Acme Logistics", now)
    .run();
  await db
    .prepare(
      `INSERT INTO plans (id, tenant_id, name, type, inclusive_mb, overage, roaming, wholesale_plan, comm_plan, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(planId, tenantId, "Telematics 50", "Telematics", 50, "throttle", "AU/NZ", "T50", "data", now)
    .run();
  await db
    .prepare("INSERT INTO pools (id, tenant_id, name, type, cap_mb, used_mb, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(poolId, tenantId, "Fleet-A", "Fleet data", 10240, 6350, now)
    .run();

  const orders = [
    [receivedOrderId, "nano-ltem-au", "Nano SIM LTE-M AU", 100, "Warehouse AU", "Received"],
    [openOrderA, "mff2-industrial", "MFF2 Industrial", 25, "Warehouse AU", "Submitted"],
    [openOrderB, "esim-global", "eSIM Global", 40, "ops@acme.example", "Accepted"],
  ] as const;
  for (const [id, skuId, skuName, qty, logistics, status] of orders) {
    await db
      .prepare(
        `INSERT INTO orders (id, tenant_id, sku_id, sku_name, quantity, logistics, destination, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, tenantId, skuId, skuName, qty, logistics, logistics, status, now)
      .run();
  }

  for (let n = 1; n <= 45; n += 1) {
    const assigned = n <= 40;
    await db
      .prepare(
        `INSERT INTO sims (id, tenant_id, iccid, form_factor, state, customer_id, plan_id, pool_id, order_id, wholesale_plan, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId("sim"),
        tenantId,
        padIccid(n),
        "Nano",
        assigned ? (n === 3 ? "Suspended" : "Active") : "Ready",
        assigned ? customerId : null,
        assigned ? planId : null,
        assigned ? poolId : null,
        receivedOrderId,
        "T50",
        now,
      )
      .run();
  }

  for (let d = 6; d >= 0; d -= 1) {
    const day = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    const mb = 780 + (6 - d) * 90 + (d % 2) * 40;
    await db.prepare("INSERT INTO usage_daily (tenant_id, day, mb) VALUES (?, ?, ?)").bind(tenantId, day, mb).run();
  }

  const events = [
    ["assign", "Acme Logistics · 40 SIMs assigned"],
    ["pool", "Pool Fleet-A 62%"],
    ["order", "Order received · 100 Nano SIM LTE-M AU"],
  ] as const;
  for (const [action, detail] of events) {
    await db
      .prepare(
        `INSERT INTO audit_events (id, tenant_id, actor_email, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(newId("aud"), tenantId, actorEmail, action, detail, now)
      .run();
  }

  await runCcMutation({
    tenantId,
    kind: "assign",
    payload: { customerId, simCount: 40, wholesalePlan: "T50", commPlan: "data" },
    correlationId: `seed-assign-${tenantId}`,
  });
}
