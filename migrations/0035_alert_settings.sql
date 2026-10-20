-- Configurable alert digests: recipients + thresholds per scope (platform or reseller).
CREATE TABLE IF NOT EXISTS alert_settings (
  scope_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pool', 'usage')),
  threshold_pct INTEGER NOT NULL,
  recipients_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (scope_id, kind)
);

INSERT INTO portal_schema_meta (id, version) VALUES (1, 35)
ON CONFLICT(id) DO UPDATE SET version = excluded.version;
