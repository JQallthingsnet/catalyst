-- Reseller bind-to-Jasper-customer columns (was runtime-only ALTERS).

ALTER TABLE tenants ADD COLUMN cc_customer TEXT;
ALTER TABLE tenants ADD COLUMN cc_customer_bound_email TEXT;
ALTER TABLE tenants ADD COLUMN cc_customer_bound_at TEXT;
ALTER TABLE tenants ADD COLUMN cc_default_sku_id TEXT;
ALTER TABLE tenants ADD COLUMN cc_default_platform_plan_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_cc_customer_unique
  ON tenants (cc_customer) WHERE cc_customer IS NOT NULL AND TRIM(cc_customer) != '';
