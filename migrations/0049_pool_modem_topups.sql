-- Month-scoped Reseller Plan pool top-ups (SIM-unit multipliers). No physical SIMs shipped.
-- Allowance boost = sim_units × per-SIM data allowance; charge = sim_units × unit_price_aud.
-- Only the Sydney calendar month (month_key) counts toward pool allowance.

CREATE TABLE IF NOT EXISTS pool_modem_topups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  modem_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  sim_units INTEGER NOT NULL,
  unit_price_aud REAL NOT NULL,
  per_sim_allowance_mb REAL NOT NULL,
  allowance_mb REAL NOT NULL,
  charge_aud REAL NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pool_modem_topups_tenant_month
  ON pool_modem_topups (tenant_id, month_key);

CREATE INDEX IF NOT EXISTS pool_modem_topups_tenant_modem_month
  ON pool_modem_topups (tenant_id, modem_id, month_key);
