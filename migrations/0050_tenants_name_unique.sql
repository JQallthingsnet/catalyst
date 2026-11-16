-- Organisation name is a unique key (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS tenants_name_unique ON tenants (name COLLATE NOCASE);

INSERT INTO portal_schema_meta (id, version) VALUES (1, 50)
ON CONFLICT(id) DO UPDATE SET version = excluded.version;
