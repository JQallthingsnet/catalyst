-- Portal end customer the reseller sold/assigned this SIM to (not Jasper CC customer).
ALTER TABLE cc_devices ADD COLUMN end_customer TEXT;

INSERT INTO portal_schema_meta (id, version) VALUES (1, 34)
ON CONFLICT(id) DO UPDATE SET version = excluded.version;
