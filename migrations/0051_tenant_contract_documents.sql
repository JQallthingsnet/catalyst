-- Signed contract PDF metadata (bytes live in R2 CONTRACTS bucket).
CREATE TABLE IF NOT EXISTS tenant_contract_documents (
  tenant_id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/pdf',
  size_bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT NOT NULL
);

INSERT INTO portal_schema_meta (id, version) VALUES (1, 51)
ON CONFLICT(id) DO UPDATE SET version = excluded.version;
