-- Per-contract Reseller Plan unit price (AUD) charged to the reseller organisation.
-- Backfill from legacy value_rank.
ALTER TABLE tenant_plan_assignments ADD COLUMN unit_price_aud REAL NOT NULL DEFAULT 0;
UPDATE tenant_plan_assignments SET unit_price_aud = IFNULL(value_rank, 0);
