-- Background bulk SIM updates (Activate / Deactivate / Reseller Plan), max 100 per job.
CREATE TABLE IF NOT EXISTS sim_bulk_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  platform_plan_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  total INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  ok_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  notified_at TEXT
);

CREATE TABLE IF NOT EXISTS sim_bulk_job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  iccid TEXT NOT NULL,
  action TEXT,
  platform_plan_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sim_bulk_jobs_tenant_created
  ON sim_bulk_jobs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sim_bulk_job_items_job_status
  ON sim_bulk_job_items (job_id, status);

INSERT INTO portal_schema_meta (id, version) VALUES (1, 41)
ON CONFLICT(id) DO UPDATE SET version = excluded.version;
