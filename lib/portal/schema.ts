import { getDB } from "@/lib/env";

let ready = false;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tenant_members (email TEXT NOT NULL, tenant_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (email, tenant_id))`,
  `CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, inclusive_mb INTEGER NOT NULL, overage TEXT NOT NULL, roaming TEXT NOT NULL, wholesale_plan TEXT NOT NULL, comm_plan TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pools (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, cap_mb INTEGER NOT NULL, used_mb INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, sku_id TEXT NOT NULL, sku_name TEXT NOT NULL, quantity INTEGER NOT NULL, logistics TEXT NOT NULL, destination TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sims (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, iccid TEXT NOT NULL, form_factor TEXT NOT NULL, state TEXT NOT NULL, customer_id TEXT, plan_id TEXT, pool_id TEXT, order_id TEXT, created_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sims_tenant_iccid ON sims (tenant_id, iccid)`,
  `CREATE TABLE IF NOT EXISTS cc_jobs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, correlation_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_email TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS usage_daily (tenant_id TEXT NOT NULL, day TEXT NOT NULL, mb INTEGER NOT NULL, PRIMARY KEY (tenant_id, day))`,
];

export async function ensurePortalSchema(): Promise<void> {
  if (ready) return;
  const db = getDB();
  for (const sql of STATEMENTS) {
    await db.prepare(sql).run();
  }
  ready = true;
}
