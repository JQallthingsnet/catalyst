import { getDB } from "@/lib/env";

let ready = false;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tenant_members (email TEXT NOT NULL, tenant_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (email, tenant_id))`,
  `CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, inclusive_mb INTEGER NOT NULL, overage TEXT NOT NULL, roaming TEXT NOT NULL, wholesale_plan TEXT NOT NULL, comm_plan TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pools (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, cap_mb INTEGER NOT NULL, used_mb INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, sku_id TEXT NOT NULL, sku_name TEXT NOT NULL, quantity INTEGER NOT NULL, logistics TEXT NOT NULL, destination TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sims (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, iccid TEXT NOT NULL, form_factor TEXT NOT NULL, state TEXT NOT NULL, customer_id TEXT, plan_id TEXT, pool_id TEXT, order_id TEXT, wholesale_plan TEXT, created_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sims_tenant_iccid ON sims (tenant_id, iccid)`,
  `CREATE TABLE IF NOT EXISTS cc_jobs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, correlation_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_email TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS usage_daily (tenant_id TEXT NOT NULL, day TEXT NOT NULL, mb INTEGER NOT NULL, PRIMARY KEY (tenant_id, day))`,
  `CREATE TABLE IF NOT EXISTS super_admins (email TEXT PRIMARY KEY, added_by TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL, tenant_id TEXT NOT NULL, invited_by TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tenant_members_one_org ON tenant_members (email)`,
];

const ALTERS = [`ALTER TABLE sims ADD COLUMN wholesale_plan TEXT`];

export async function ensurePortalSchema(): Promise<void> {
  if (ready) return;
  const db = getDB();
  for (const sql of STATEMENTS) {
    await db.prepare(sql).run();
  }
  for (const sql of ALTERS) {
    try {
      await db.prepare(sql).run();
    } catch {
      // Column already exists on databases created with the current schema.
    }
  }
  ready = true;
}
