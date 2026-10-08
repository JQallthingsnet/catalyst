import { getDB } from "@/lib/env";
import { resetPortalColumnCache } from "@/lib/portal/d1-compat";

let ready = false;
let inflight: Promise<void> | null = null;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)`,
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
  `CREATE TABLE IF NOT EXISTS platform_plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, cc_rate_plan TEXT NOT NULL, comm_plan TEXT NOT NULL, created_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, supplier TEXT NOT NULL DEFAULT 'Optus')`,
  `CREATE TABLE IF NOT EXISTS tenant_plan_assignments (tenant_id TEXT NOT NULL, platform_plan_id TEXT NOT NULL, created_at TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tenant_id, platform_plan_id))`,
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
    details_polled_at TEXT,
    imei TEXT,
    customer TEXT,
    end_consumer_id TEXT,
    date_updated TEXT,
    date_shipped TEXT,
    account_id TEXT,
    fixed_ip_address TEXT,
    fixed_ipv6_address TEXT,
    sim_notes TEXT,
    device_id TEXT,
    modem_id TEXT,
    global_sim_type TEXT,
    mec TEXT,
    euiccid TEXT,
    sim_profile_id TEXT,
    custom_fields TEXT,
    details_json TEXT,
    supplier TEXT NOT NULL DEFAULT 'Optus'
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
  `CREATE TABLE IF NOT EXISTS sim_skus (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    form_factor TEXT NOT NULL,
    tech TEXT NOT NULL,
    region TEXT NOT NULL,
    blurb TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sim_rate_plan_changes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    iccid TEXT NOT NULL,
    from_platform_plan_id TEXT,
    to_platform_plan_id TEXT NOT NULL,
    from_rate_plan TEXT,
    to_rate_plan TEXT NOT NULL,
    sim_state TEXT NOT NULL,
    tcode_mismatch INTEGER NOT NULL DEFAULT 0,
    actor_email TEXT NOT NULL,
    created_at TEXT NOT NULL,
    push_status TEXT NOT NULL DEFAULT 'pending',
    pushed_at TEXT,
    push_error TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS sim_rate_plan_changes_iccid_created
    ON sim_rate_plan_changes (iccid, created_at)`,
  `CREATE INDEX IF NOT EXISTS sim_rate_plan_changes_tenant_created
    ON sim_rate_plan_changes (tenant_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS sim_rate_plan_changes_push_status
    ON sim_rate_plan_changes (push_status, created_at)`,
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
  `ALTER TABLE cc_devices ADD COLUMN imei TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN customer TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN end_consumer_id TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN date_updated TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN date_shipped TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN account_id TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN fixed_ip_address TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN fixed_ipv6_address TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN sim_notes TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN device_id TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN modem_id TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN global_sim_type TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN mec TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN euiccid TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN sim_profile_id TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN custom_fields TEXT`,
  `ALTER TABLE cc_devices ADD COLUMN details_json TEXT`,
  `ALTER TABLE cc_sync_state ADD COLUMN auto_poll INTEGER NOT NULL DEFAULT 1`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sims_iccid ON sims (iccid)`,
  `ALTER TABLE tenants ADD COLUMN active INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE platform_plans ADD COLUMN active INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE tenant_plan_assignments ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE platform_plans ADD COLUMN supplier TEXT NOT NULL DEFAULT 'Optus'`,
  `ALTER TABLE cc_devices ADD COLUMN supplier TEXT NOT NULL DEFAULT 'Optus'`,
  `ALTER TABLE sim_rate_plan_changes ADD COLUMN push_status TEXT NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE sim_rate_plan_changes ADD COLUMN pushed_at TEXT`,
  `ALTER TABLE sim_rate_plan_changes ADD COLUMN push_error TEXT`,
];

const BACKFILLS = [
  `UPDATE platform_plans SET supplier = 'Optus' WHERE supplier = 'Cisco IoT Control Center'`,
  `UPDATE cc_devices SET supplier = 'Optus' WHERE IFNULL(TRIM(supplier), '') = '' OR supplier = 'Cisco IoT Control Center'`,
  // Historical portal-only rows: do not auto-push when Jasper write is enabled later.
  `UPDATE sim_rate_plan_changes
     SET push_status = 'skipped',
         push_error = COALESCE(push_error, 'Recorded before supplier push queue')
     WHERE IFNULL(TRIM(push_status), '') IN ('', 'pending')
       AND pushed_at IS NULL
       AND created_at < '2026-10-08T00:00:00.000Z'`,
];

/**
 * Idempotent schema bootstrap. Must stay cheap on the dashboard hot path:
 * Next.js RSC prefetches many `/dashboard/*` routes; each hits `requirePortal`.
 * Running every ALTER on every request burns Worker CPU (esp. Free 10ms limit).
 */
export async function ensurePortalSchema(): Promise<void> {
  if (ready) return;
  if (inflight) return inflight;

  inflight = (async () => {
    const db = getDB();
    resetPortalColumnCache();

    for (const sql of ALTERS) {
      try {
        await db.prepare(sql).run();
      } catch {
        // Column or index already exists.
      }
    }

    for (const sql of STATEMENTS) {
      try {
        await db.prepare(sql).run();
      } catch {
        // Table/index may already exist on older D1.
      }
    }

    for (const sql of BACKFILLS) {
      try {
        await db.prepare(sql).run();
      } catch {
        // Column may not exist on a brand-new empty database yet.
      }
    }

    ready = true;
    resetPortalColumnCache();
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
