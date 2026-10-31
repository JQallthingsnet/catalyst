-- Allow Alerts save with recipients only (event emails) or threshold only (digests need both).
-- SQLite cannot DROP NOT NULL in place — rebuild table.
CREATE TABLE IF NOT EXISTS alert_settings_0040 (
  scope_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pool', 'usage')),
  threshold_pct INTEGER,
  recipients_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (scope_id, kind)
);

INSERT OR IGNORE INTO alert_settings_0040
  (scope_id, kind, threshold_pct, recipients_json, updated_at, updated_by)
SELECT scope_id, kind, threshold_pct, recipients_json, updated_at, updated_by
FROM alert_settings;

DROP TABLE IF EXISTS alert_settings;
ALTER TABLE alert_settings_0040 RENAME TO alert_settings;

INSERT INTO portal_schema_meta (id, version) VALUES (1, 40)
ON CONFLICT(id) DO UPDATE SET version = excluded.version;
