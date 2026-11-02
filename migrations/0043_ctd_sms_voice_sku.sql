-- CC snapshot: cycle-to-date SMS / voice + SKU from Control Center.
ALTER TABLE cc_devices ADD COLUMN ctd_sms REAL;
ALTER TABLE cc_devices ADD COLUMN ctd_voice_min REAL;
ALTER TABLE cc_devices ADD COLUMN sku TEXT;

-- Pool daily aggregates (same grouping as data CTD).
ALTER TABLE pool_customer_daily ADD COLUMN ctd_sms REAL NOT NULL DEFAULT 0;
ALTER TABLE pool_customer_daily ADD COLUMN ctd_voice_min REAL NOT NULL DEFAULT 0;

ALTER TABLE pool_rate_plan_daily ADD COLUMN ctd_sms REAL NOT NULL DEFAULT 0;
ALTER TABLE pool_rate_plan_daily ADD COLUMN ctd_voice_min REAL NOT NULL DEFAULT 0;

ALTER TABLE pool_modem_daily ADD COLUMN ctd_sms REAL NOT NULL DEFAULT 0;
ALTER TABLE pool_modem_daily ADD COLUMN ctd_voice_min REAL NOT NULL DEFAULT 0;
