-- CC sync flags previously applied only via runtime ensurePortalSchema ALTERS.
-- One-shot flags default to 1 so existing estates are not re-reset on apply.

ALTER TABLE cc_sync_state ADD COLUMN auto_poll INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cc_sync_state ADD COLUMN list_cycle_started_at TEXT;
ALTER TABLE cc_sync_state ADD COLUMN search_reset_v1 INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cc_sync_state ADD COLUMN supplier_backfill_v1 INTEGER NOT NULL DEFAULT 1;
