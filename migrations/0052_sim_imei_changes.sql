-- IMEI change log (CC snapshot stays one row per ICCID with latest IMEI).
CREATE TABLE IF NOT EXISTS sim_imei_changes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  iccid TEXT NOT NULL,
  from_imei TEXT NOT NULL,
  to_imei TEXT NOT NULL,
  customer TEXT,
  status TEXT,
  rate_plan TEXT,
  modem_id TEXT,
  imsi TEXT,
  msisdn TEXT,
  source TEXT NOT NULL DEFAULT 'cc_poll',
  detected_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sim_imei_changes_iccid_detected
  ON sim_imei_changes (iccid, detected_at DESC);

CREATE INDEX IF NOT EXISTS sim_imei_changes_tenant_detected
  ON sim_imei_changes (tenant_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS sim_imei_changes_detected
  ON sim_imei_changes (detected_at DESC);

INSERT INTO portal_schema_meta (id, version) VALUES (1, 52)
ON CONFLICT(id) DO UPDATE SET version = excluded.version;
