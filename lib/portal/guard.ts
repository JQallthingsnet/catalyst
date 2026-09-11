import { ensureAuthSchema } from "@/lib/auth/schema";
import { getSession } from "@/lib/auth/session";
import { resolvePortalContext } from "@/lib/portal/access";
import { can, type Privilege } from "@/lib/portal/roles";
import { ensurePortalSchema } from "@/lib/portal/schema";
import type { PortalContext } from "@/lib/portal/repo";
import { redirect } from "next/navigation";

export async function requirePortal(): Promise<PortalContext> {
  const session = await getSession();
  if (!session) redirect("/");
  await ensureAuthSchema();
  await ensurePortalSchema();
  return resolvePortalContext(session.email);
}

export async function requirePrivilege(privilege: Privilege): Promise<PortalContext> {
  const ctx = await requirePortal();
  if (!can(ctx.role, privilege)) redirect("/dashboard");
  return ctx;
}
