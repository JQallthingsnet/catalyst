CREATE TABLE IF NOT EXISTS tenant_sku_assignments (
  tenant_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, sku_id)
);
