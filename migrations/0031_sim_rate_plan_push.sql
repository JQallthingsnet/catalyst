-- Supplier push queue columns + skip historical portal-only rows.

ALTER TABLE sim_rate_plan_changes ADD COLUMN push_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE sim_rate_plan_changes ADD COLUMN pushed_at TEXT;
ALTER TABLE sim_rate_plan_changes ADD COLUMN push_error TEXT;

CREATE INDEX IF NOT EXISTS sim_rate_plan_changes_push_status
  ON sim_rate_plan_changes (push_status, created_at);

UPDATE sim_rate_plan_changes
SET push_status = 'skipped',
    push_error = COALESCE(push_error, 'Recorded before supplier push queue')
WHERE IFNULL(TRIM(push_status), '') IN ('', 'pending')
  AND pushed_at IS NULL
  AND created_at < '2026-10-08T00:00:00.000Z';
