-- Per-contract Reseller Plan value ranking: higher wins billing when multiple
-- plans apply to the same ICCID on the same Sydney day.
ALTER TABLE tenant_plan_assignments ADD COLUMN value_rank INTEGER NOT NULL DEFAULT 0;
