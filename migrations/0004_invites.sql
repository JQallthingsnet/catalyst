CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
