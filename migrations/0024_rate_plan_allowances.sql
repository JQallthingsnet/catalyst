-- Super-admin Usage: inferred allowance per Jasper/CC rate plan (vs modem_ID for resellers).
CREATE TABLE IF NOT EXISTS rate_plan_allowances (
  rate_plan TEXT PRIMARY KEY,
  allowance_mb REAL NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

ALTER TABLE sim_allowance_alerts ADD COLUMN rate_plan TEXT;
ALTER TABLE sim_allowance_alerts ADD COLUMN basis TEXT;
