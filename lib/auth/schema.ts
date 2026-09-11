import { getDB } from "@/lib/env";

let ready = false;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, created_at TEXT NOT NULL, last_login_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS auth_codes (email TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS auth_rate_limits (bucket TEXT NOT NULL, identifier TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, window_start TEXT NOT NULL, PRIMARY KEY (bucket, identifier))`,
];

export async function ensureAuthSchema(): Promise<void> {
  if (ready) return;

  const db = getDB();
  for (const sql of STATEMENTS) {
    await db.prepare(sql).run();
  }

  ready = true;
}
