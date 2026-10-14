-- Per-SIM modem allowance alerts (80% CTD). One email row per ICCID × Sydney day × threshold.
CREATE TABLE IF NOT EXISTS sim_allowance_alerts (
  iccid TEXT NOT NULL,
  day TEXT NOT NULL,
  threshold INTEGER NOT NULL,
  pct REAL NOT NULL,
  ctd_usage_mb REAL NOT NULL,
  allowance_mb REAL NOT NULL,
  modem_id TEXT,
  customer TEXT,
  emailed_at TEXT NOT NULL,
  PRIMARY KEY (iccid, day, threshold)
);

CREATE INDEX IF NOT EXISTS sim_allowance_alerts_day ON sim_allowance_alerts (day);
