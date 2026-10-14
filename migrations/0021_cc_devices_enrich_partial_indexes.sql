-- Enrich queues must ORDER BY the indexed column alone.
-- COALESCE(...) / "IS NULL DESC" expressions force full-table scans and burned
-- free-tier daily rows_read (~1M/day) even after plain indexes from 0020.
-- Partial indexes match the three auto-poll queue predicates.
CREATE INDEX IF NOT EXISTS cc_devices_never_details_polled
  ON cc_devices (polled_at) WHERE details_polled_at IS NULL;

CREATE INDEX IF NOT EXISTS cc_devices_session_queue
  ON cc_devices (polled_at) WHERE details_polled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS cc_devices_details_queue
  ON cc_devices (details_polled_at) WHERE details_polled_at IS NOT NULL;
