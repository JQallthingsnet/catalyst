CREATE TABLE IF NOT EXISTS cc_devices (
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
);

CREATE TABLE IF NOT EXISTS cc_sync_state (
  id TEXT PRIMARY KEY,
  modified_since TEXT,
  next_page INTEGER NOT NULL DEFAULT 1,
  locked_until TEXT,
  last_polled_at TEXT,
  last_error TEXT,
  last_total INTEGER,
  last_page INTEGER,
  last_page_complete INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE sims ADD COLUMN cc_status TEXT;
ALTER TABLE sims ADD COLUMN cc_polled_at TEXT;
