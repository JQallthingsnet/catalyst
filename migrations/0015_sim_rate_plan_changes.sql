CREATE TABLE IF NOT EXISTS sim_rate_plan_changes (
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
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sim_rate_plan_changes_iccid_created
  ON sim_rate_plan_changes (iccid, created_at);

CREATE INDEX IF NOT EXISTS sim_rate_plan_changes_tenant_created
  ON sim_rate_plan_changes (tenant_id, created_at DESC);
