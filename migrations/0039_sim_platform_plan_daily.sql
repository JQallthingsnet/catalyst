-- Per Sydney day: every Reseller Plan that applied to an ICCID that day (multiple rows if changed).
CREATE TABLE IF NOT EXISTS sim_platform_plan_daily (
  tenant_id TEXT NOT NULL,
  iccid TEXT NOT NULL,
  day TEXT NOT NULL,
  platform_plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  supplier_code TEXT,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, iccid, day, platform_plan_id)
);

CREATE INDEX IF NOT EXISTS sim_platform_plan_daily_tenant_day
  ON sim_platform_plan_daily (tenant_id, day DESC);

CREATE INDEX IF NOT EXISTS sim_platform_plan_daily_iccid_day
  ON sim_platform_plan_daily (iccid, day DESC);
