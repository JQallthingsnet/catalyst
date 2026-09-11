CREATE TABLE IF NOT EXISTS super_admins (
  email TEXT PRIMARY KEY,
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
