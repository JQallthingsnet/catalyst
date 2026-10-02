import { sendInviteEmail } from "@/lib/auth/email";
import { isValidEmail, normalizeEmail } from "@/lib/auth/codes";
import { getDB } from "@/lib/env";
import { newId } from "@/lib/portal/ids";
import { writeAudit, type PortalContext } from "@/lib/portal/repo";
import { addSuperAdmin } from "@/lib/portal/roles";
import { can, type PortalRole } from "@/lib/portal/role-model";
import { createResellerOrganisation, loadTenant, membershipTenantId } from "@/lib/portal/tenant";

export type Invite = {
  id: string;
  email: string;
  role: PortalRole;
  invitedBy: string;
  createdAt: string;
  tenantId?: string;
  tenantName?: string;
};

export function inviteableRoles(role: PortalRole): PortalRole[] {
  const roles: PortalRole[] = [];
  if (can(role, "invite.super_admin")) roles.push("super_admin");
  if (can(role, "invite.reseller_admin")) roles.push("reseller_admin");
  if (can(role, "invite.operator")) roles.push("reseller_operator");
  return roles;
}

export async function listInvites(tenantId: string): Promise<Invite[]> {
  const rows = await getDB()
    .prepare(
      `SELECT id, email, role, invited_by, created_at FROM invites WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .bind(tenantId)
    .all<{ id: string; email: string; role: PortalRole; invited_by: string; created_at: string }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
  }));
}

/** Platform log: every invite, including those sent by reseller admins. */
export async function listAllInvites(limit = 50): Promise<Invite[]> {
  const rows = await getDB()
    .prepare(
      `SELECT i.id, i.email, i.role, i.invited_by, i.created_at, i.tenant_id, t.name AS tenant_name
       FROM invites i
       LEFT JOIN tenants t ON t.id = i.tenant_id
       ORDER BY i.created_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{
      id: string;
      email: string;
      role: PortalRole;
      invited_by: string;
      created_at: string;
      tenant_id: string;
      tenant_name: string | null;
    }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name ?? row.tenant_id,
  }));
}

export async function listTenantMembers(tenantId: string): Promise<{ email: string; role: string }[]> {
  const rows = await getDB()
    .prepare("SELECT email, role FROM tenant_members WHERE tenant_id = ? ORDER BY email")
    .bind(tenantId)
    .all<{ email: string; role: string }>();
  return rows.results ?? [];
}

export async function createAndSendInvite(input: {
  ctx: PortalContext;
  email: string;
  role: PortalRole;
  signInUrl: string;
  organisationName?: string;
  organisationId?: string;
}): Promise<{ tenantId: string; tenantName: string }> {
  const allowed = inviteableRoles(input.ctx.role);
  if (!allowed.includes(input.role)) {
    throw new Error("You cannot invite that role.");
  }

  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new Error("Enter a valid email address.");
  if (email === input.ctx.email) throw new Error("You are already signed in with that email.");

  let tenantId = input.ctx.tenantId;
  let tenantName = input.ctx.tenantName;
  const organisationName = input.organisationName?.trim();
  const organisationId = input.organisationId?.trim();

  if (input.role === "reseller_admin" && input.ctx.isSuperAdmin && input.ctx.role === "super_admin") {
    if (!organisationName) {
      throw new Error("Enter the reseller organisation name. It appears top left in their portal.");
    }
  }

  if (input.role === "reseller_operator" && input.ctx.isSuperAdmin && input.ctx.role === "super_admin") {
    if (!organisationId) {
      throw new Error("Choose which reseller organisation this operator belongs to.");
    }
    if (organisationId === input.ctx.homeTenantId) {
      throw new Error("Operators must belong to a reseller organisation, not ATN Platform.");
    }
    const org = await loadTenant(organisationId);
    if (!org) throw new Error("Organisation not found.");
    if (!org.active) throw new Error("That organisation is deactivated. Reactivate it before inviting.");
    tenantId = org.id;
    tenantName = org.name;
  }

  if (organisationName) {
    if (!input.ctx.isSuperAdmin || input.role !== "reseller_admin") {
      throw new Error("Only a super admin can create a reseller organisation.");
    }
    const org = await createResellerOrganisation(organisationName);
    tenantId = org.id;
    tenantName = org.name;
  }

  const existingTenant = await membershipTenantId(email);
  if (existingTenant && existingTenant !== tenantId) {
    throw new Error("That email already belongs to another organisation.");
  }

  const membershipRole: PortalRole = input.role === "super_admin" ? "reseller_admin" : input.role;
  const now = new Date().toISOString();

  if (input.role === "super_admin") {
    await addSuperAdmin(email, input.ctx.email);
  }

  await getDB()
    .prepare(
      `INSERT INTO tenant_members (email, tenant_id, role) VALUES (?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET role = excluded.role`,
    )
    .bind(email, tenantId, membershipRole)
    .run();

  await getDB()
    .prepare(
      `INSERT INTO invites (id, email, role, tenant_id, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId("inv"), email, input.role, tenantId, input.ctx.email, now)
    .run();

  await sendInviteEmail({
    to: email,
    role: input.role,
    invitedBy: input.ctx.email,
    tenantName,
    signInUrl: input.signInUrl,
  });

  await writeAudit(tenantId, input.ctx.email, "invite", `Invited ${email} as ${input.role}`);
  return { tenantId, tenantName };
}
