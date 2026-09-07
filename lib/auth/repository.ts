import { getDB } from "@/lib/env";

export type AuthCodeRow = {
  email: string;
  code: string;
  expires_at: string;
  attempts: number;
};

export type User = {
  email: string;
  name: string | null;
  createdAt: string;
  lastLoginAt: string;
};

export async function upsertAuthCode(email: string, code: string, expiresAt: string): Promise<void> {
  const now = new Date().toISOString();
  await getDB()
    .prepare(
      `INSERT INTO auth_codes (email, code, expires_at, attempts, created_at)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(email) DO UPDATE SET
         code = excluded.code,
         expires_at = excluded.expires_at,
         attempts = 0,
         created_at = excluded.created_at`,
    )
    .bind(email, code, expiresAt, now)
    .run();
}

export async function getAuthCode(email: string): Promise<AuthCodeRow | null> {
  return getDB()
    .prepare("SELECT email, code, expires_at, attempts FROM auth_codes WHERE email = ?")
    .bind(email)
    .first<AuthCodeRow>();
}

export async function incrementAuthCodeAttempts(email: string, attempts: number): Promise<void> {
  await getDB()
    .prepare("UPDATE auth_codes SET attempts = ? WHERE email = ?")
    .bind(attempts, email)
    .run();
}

export async function deleteAuthCode(email: string): Promise<void> {
  await getDB().prepare("DELETE FROM auth_codes WHERE email = ?").bind(email).run();
}

export async function upsertUser(email: string): Promise<User> {
  const db = getDB();
  const now = new Date().toISOString();
  const existing = await db
    .prepare("SELECT email, name, created_at, last_login_at FROM users WHERE email = ?")
    .bind(email)
    .first<{
      email: string;
      name: string | null;
      created_at: string;
      last_login_at: string;
    }>();

  if (existing) {
    await db.prepare("UPDATE users SET last_login_at = ? WHERE email = ?").bind(now, email).run();
    return {
      email: existing.email,
      name: existing.name,
      createdAt: existing.created_at,
      lastLoginAt: now,
    };
  }

  await db
    .prepare("INSERT INTO users (email, name, created_at, last_login_at) VALUES (?, ?, ?, ?)")
    .bind(email, null, now, now)
    .run();

  return { email, name: null, createdAt: now, lastLoginAt: now };
}

export async function getUser(email: string): Promise<User | null> {
  const row = await getDB()
    .prepare("SELECT email, name, created_at, last_login_at FROM users WHERE email = ?")
    .bind(email)
    .first<{
      email: string;
      name: string | null;
      created_at: string;
      last_login_at: string;
    }>();
  if (!row) return null;
  return {
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}
