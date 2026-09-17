CREATE TABLE IF NOT EXISTS platform_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cc_rate_plan TEXT NOT NULL,
  comm_plan TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_plan_assignments (
  tenant_id TEXT NOT NULL,
  platform_plan_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, platform_plan_id)
);

ALTER TABLE sims ADD COLUMN platform_plan_id TEXT;
ALTER TABLE sims ADD COLUMN imsi TEXT;
ALTER TABLE sims ADD COLUMN msisdn TEXT;
ALTER TABLE sims ADD COLUMN current_volume_mb REAL;
ALTER TABLE plans ADD COLUMN platform_plan_id TEXT;
ALTER TABLE plans ADD COLUMN price_per_sim REAL;
