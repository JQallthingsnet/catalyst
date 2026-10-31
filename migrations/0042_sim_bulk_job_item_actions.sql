-- Per-ICCID action on bulk jobs (Activate / Deactivate / rate_plan can differ in one run).
ALTER TABLE sim_bulk_job_items ADD COLUMN action TEXT;
ALTER TABLE sim_bulk_job_items ADD COLUMN platform_plan_id TEXT;

INSERT INTO portal_schema_meta (id, version) VALUES (1, 42)
ON CONFLICT(id) DO UPDATE SET version = excluded.version;
