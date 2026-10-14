-- Pools: store rate-plan allowance sum alongside modem_ID allowance.
-- Super admin Pools uses rate_plan_allowance_mb; reseller uses allowance_mb (modem_ID).

ALTER TABLE pool_customer_daily ADD COLUMN rate_plan_allowance_mb REAL;
