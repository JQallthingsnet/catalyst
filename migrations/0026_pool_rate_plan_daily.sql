-- Super-admin Pools: daily CTD / allowance grouped by Jasper rate plan (not CC customer).

CREATE TABLE IF NOT EXISTS pool_rate_plan_daily (
  rate_plan TEXT NOT NULL,
  day TEXT NOT NULL,
  ctd_usage_mb REAL NOT NULL,
  allowance_mb REAL NOT NULL,
  sim_count INTEGER NOT NULL,
  snapshotted_at TEXT NOT NULL,
  PRIMARY KEY (rate_plan, day)
);

CREATE INDEX IF NOT EXISTS pool_rate_plan_daily_day ON pool_rate_plan_daily (day);
CREATE INDEX IF NOT EXISTS pool_rate_plan_daily_plan ON pool_rate_plan_daily (rate_plan);
