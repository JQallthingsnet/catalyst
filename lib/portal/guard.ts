import { ensureAuthSchema } from "@/lib/auth/schema";
import { getSession } from "@/lib/auth/session";
import { getOrCreatePortalContext, type PortalContext } from "@/lib/portal/repo";
import { can, effectiveRole, getViewAsCookie, isListedSuperAdmin, type Privilege } from "@/lib/portal/roles";
import { ensurePortalSchema } from "@/lib/portal/schema";
import { redirect } from "next/navigation";

export async function requirePortal(): Promise<PortalContext> {
  const session = await getSession();
  if (!session) redirect("/");
  await ensureAuthSchema();
  await ensurePortalSchema();
  const ctx = await getOrCreatePortalContext(session.email);
  const isSuperAdmin = await isListedSuperAdmin(session.email);
  const viewAs = isSuperAdmin ? await getViewAsCookie() : null;
  return {
    ...ctx,
    isSuperAdmin,
    role: isSuperAdmin ? effectiveRole(true, viewAs) : ctx.role,
  };
}

export async function requirePrivilege(privilege: Privilege): Promise<PortalContext> {
  const ctx = await requirePortal();
  if (!can(ctx.role, privilege)) redirect("/dashboard");
  return ctx;
}
