-- Cheap ready-flag for Workers (replaces runtime ALTER/CREATE bootstrap).
CREATE TABLE IF NOT EXISTS portal_schema_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);

INSERT INTO portal_schema_meta (id, version) VALUES (1, 32)
ON CONFLICT(id) DO UPDATE SET version = excluded.version;
