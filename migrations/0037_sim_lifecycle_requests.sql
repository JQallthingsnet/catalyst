-- Reseller lifecycle actions queued for ATN bulk processing (Order SIMs notify recipients).
CREATE TABLE IF NOT EXISTS sim_lifecycle_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  iccid TEXT NOT NULL,
  action TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  notified_at TEXT
);

CREATE INDEX IF NOT EXISTS sim_lifecycle_requests_tenant_status
  ON sim_lifecycle_requests (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS sim_lifecycle_requests_iccid
  ON sim_lifecycle_requests (iccid, created_at DESC);

INSERT INTO portal_schema_meta (id, version) VALUES (1, 37)
ON CONFLICT(id) DO UPDATE SET version = excluded.version;
