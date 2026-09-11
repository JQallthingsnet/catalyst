import { cookies } from "next/headers";
import { normalizeEmail, isValidEmail } from "@/lib/auth/codes";
import { getDB, getEnv } from "@/lib/env";
import { parseViewRole, VIEW_AS_COOKIE, type PortalRole } from "@/lib/portal/role-model";

export {
  can,
  effectiveRole,
  navForRole,
  parseViewRole,
  VIEW_AS_COOKIE,
  VIEW_ROLES,
  type PortalRole,
  type Privilege,
} from "@/lib/portal/role-model";

export function bootstrapAdminEmails(): string[] {
  const raw = getEnv().SUPER_ADMIN_EMAIL ?? "";
  return raw
    .split(/[,;\s]+/)
    .map((value) => normalizeEmail(value))
    .filter(isValidEmail);
}

export async function syncBootstrapSuperAdmins(): Promise<void> {
  const db = getDB();
  const now = new Date().toISOString();
  for (const email of bootstrapAdminEmails()) {
    await db
      .prepare(
        `INSERT INTO super_admins (email, added_by, created_at) VALUES (?, 'env', ?)
         ON CONFLICT(email) DO NOTHING`,
      )
      .bind(email, now)
      .run();
  }
}

export async function isListedSuperAdmin(email: string): Promise<boolean> {
  await syncBootstrapSuperAdmins();
  const row = await getDB()
    .prepare("SELECT email FROM super_admins WHERE email = ?")
    .bind(normalizeEmail(email))
    .first<{ email: string }>();
  return Boolean(row);
}

export async function listSuperAdmins(): Promise<{ email: string; addedBy: string; createdAt: string }[]> {
  await syncBootstrapSuperAdmins();
  const rows = await getDB()
    .prepare("SELECT email, added_by, created_at FROM super_admins ORDER BY created_at ASC")
    .all<{ email: string; added_by: string; created_at: string }>();
  return (rows.results ?? []).map((row) => ({
    email: row.email,
    addedBy: row.added_by,
    createdAt: row.created_at,
  }));
}

export async function addSuperAdmin(email: string, addedBy: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) throw new Error("Enter a valid email address.");
  await getDB()
    .prepare(
      `INSERT INTO super_admins (email, added_by, created_at) VALUES (?, ?, ?)
       ON CONFLICT(email) DO NOTHING`,
    )
    .bind(normalized, addedBy, new Date().toISOString())
    .run();
}

export async function getViewAsCookie(): Promise<PortalRole | null> {
  return parseViewRole((await cookies()).get(VIEW_AS_COOKIE)?.value);
}

export async function setViewAsCookie(role: PortalRole): Promise<void> {
  (await cookies()).set(VIEW_AS_COOKIE, role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearViewAsCookie(): Promise<void> {
  (await cookies()).delete(VIEW_AS_COOKIE);
}
