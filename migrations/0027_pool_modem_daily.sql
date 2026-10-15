-- Reseller Pools: daily CTD / modem_ID allowance grouped by modem_ID (scoped by CC customer).

CREATE TABLE IF NOT EXISTS pool_modem_daily (
  modem_id TEXT NOT NULL,
  day TEXT NOT NULL,
  customer TEXT,
  ctd_usage_mb REAL NOT NULL,
  allowance_mb REAL NOT NULL,
  sim_count INTEGER NOT NULL,
  snapshotted_at TEXT NOT NULL,
  PRIMARY KEY (modem_id, day)
);

CREATE INDEX IF NOT EXISTS pool_modem_daily_day ON pool_modem_daily (day);
CREATE INDEX IF NOT EXISTS pool_modem_daily_customer ON pool_modem_daily (customer);
CREATE INDEX IF NOT EXISTS pool_modem_daily_modem ON pool_modem_daily (modem_id);
