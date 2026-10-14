-- Pools v2: manual modem_ID allowances + daily CTD snapshots per Jasper/CC customer.
-- CTD is cycle-to-date (not a daily delta); we store the sum as-of each Sydney day.

CREATE TABLE IF NOT EXISTS modem_allowances (
  modem_id TEXT PRIMARY KEY,
  allowance_mb REAL NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pool_customer_daily (
  customer TEXT NOT NULL,
  day TEXT NOT NULL,
  ctd_usage_mb REAL NOT NULL,
  allowance_mb REAL NOT NULL,
  modem_count INTEGER NOT NULL,
  sim_count INTEGER NOT NULL,
  snapshotted_at TEXT NOT NULL,
  PRIMARY KEY (customer, day)
);

CREATE INDEX IF NOT EXISTS pool_customer_daily_day ON pool_customer_daily (day);
CREATE INDEX IF NOT EXISTS pool_customer_daily_customer ON pool_customer_daily (customer);
