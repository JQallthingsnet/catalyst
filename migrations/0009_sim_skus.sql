CREATE TABLE IF NOT EXISTS sim_skus (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  form_factor TEXT NOT NULL,
  tech TEXT NOT NULL,
  region TEXT NOT NULL,
  blurb TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
