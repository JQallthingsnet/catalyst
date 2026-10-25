-- Super admin: who receives email when a reseller submits Order SIMs.
CREATE TABLE IF NOT EXISTS order_notify_settings (
  scope_id TEXT PRIMARY KEY,
  recipients_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

INSERT INTO portal_schema_meta (id, version) VALUES (1, 36)
ON CONFLICT(id) DO UPDATE SET version = excluded.version;
