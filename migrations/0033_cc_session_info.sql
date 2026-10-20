-- Jasper sessionInfo details (beyond in_session yes/no).
ALTER TABLE cc_devices ADD COLUMN session_started_at TEXT;
ALTER TABLE cc_devices ADD COLUMN session_ended_at TEXT;
ALTER TABLE cc_devices ADD COLUMN session_ip TEXT;
ALTER TABLE cc_devices ADD COLUMN session_apn TEXT;

INSERT INTO portal_schema_meta (id, version) VALUES (1, 33)
ON CONFLICT(id) DO UPDATE SET version = excluded.version;
