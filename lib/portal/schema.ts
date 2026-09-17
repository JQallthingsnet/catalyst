import { getDB } from "@/lib/env";

let ready = false;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tenant_members (email TEXT NOT NULL, tenant_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (email, tenant_id))`,
  `CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, inclusive_mb INTEGER NOT NULL, overage TEXT NOT NULL, roaming TEXT NOT NULL, wholesale_plan TEXT NOT NULL, comm_plan TEXT NOT NULL, platform_plan_id TEXT, price_per_sim REAL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pools (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, cap_mb INTEGER NOT NULL, used_mb INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, sku_id TEXT NOT NULL, sku_name TEXT NOT NULL, quantity INTEGER NOT NULL, logistics TEXT NOT NULL, destination TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sims (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, iccid TEXT NOT NULL, form_factor TEXT NOT NULL, state TEXT NOT NULL, customer_id TEXT, plan_id TEXT, pool_id TEXT, order_id TEXT, wholesale_plan TEXT, platform_plan_id TEXT, imsi TEXT, msisdn TEXT, current_volume_mb REAL, created_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sims_tenant_iccid ON sims (tenant_id, iccid)`,
  `CREATE TABLE IF NOT EXISTS cc_jobs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, correlation_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_email TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS usage_daily (tenant_id TEXT NOT NULL, day TEXT NOT NULL, mb INTEGER NOT NULL, PRIMARY KEY (tenant_id, day))`,
  `CREATE TABLE IF NOT EXISTS super_admins (email TEXT PRIMARY KEY, added_by TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL, tenant_id TEXT NOT NULL, invited_by TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS platform_plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, cc_rate_plan TEXT NOT NULL, comm_plan TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tenant_plan_assignments (tenant_id TEXT NOT NULL, platform_plan_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (tenant_id, platform_plan_id))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tenant_members_one_org ON tenant_members (email)`,
  `CREATE TABLE IF NOT EXISTS cc_devices (
    iccid TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    rate_plan TEXT,
    communication_plan TEXT,
    imsi TEXT,
    msisdn TEXT,
    ctd_usage_mb REAL,
    in_session INTEGER,
    date_added TEXT,
    date_activated TEXT,
    polled_at TEXT NOT NULL,
    details_polled_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS cc_sync_state (
    id TEXT PRIMARY KEY,
    modified_since TEXT,
    next_page INTEGER NOT NULL DEFAULT 1,
    locked_until TEXT,
    last_polled_at TEXT,
    last_error TEXT,
    last_total INTEGER,
    last_page INTEGER,
    last_page_complete INTEGER NOT NULL DEFAULT 0,
    auto_poll INTEGER NOT NULL DEFAULT 1
  )`,
];

const ALTERS = [
  `ALTER TABLE sims ADD COLUMN wholesale_plan TEXT`,
  `ALTER TABLE sims ADD COLUMN platform_plan_id TEXT`,
  `ALTER TABLE sims ADD COLUMN imsi TEXT`,
  `ALTER TABLE sims ADD COLUMN msisdn TEXT`,
  `ALTER TABLE sims ADD COLUMN current_volume_mb REAL`,
  `ALTER TABLE plans ADD COLUMN platform_plan_id TEXT`,
  `ALTER TABLE plans ADD COLUMN price_per_sim REAL`,
  `ALTER TABLE sims ADD COLUMN cc_status TEXT`,
  `ALTER TABLE sims ADD COLUMN cc_polled_at TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN imsi TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN msisdn TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN ctd_usage_mb REAL`,
  `ALTER TABLE cc_devices ADD COLUMN in_session INTEGER`,
  `ALTER TABLE cc_devices ADD COLUMN date_added TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN date_activated TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN details_polled_at TEXT`,
  `ALTER TABLE cc_sync_state ADD COLUMN auto_poll INTEGER NOT NULL DEFAULT 1`,
];

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
