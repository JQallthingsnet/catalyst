import { ensureAuthSchema } from "@/lib/auth/schema";
import { getSession } from "@/lib/auth/session";
import { getOrCreatePortalContext, type PortalContext } from "@/lib/portal/repo";
import { can, effectiveRole, getViewAsCookie, isListedSuperAdmin, type Privilege } from "@/lib/portal/roles";
import { ensurePortalSchema } from "@/lib/portal/schema";
import { NextResponse } from "next/server";

export async function requirePortalApi(): Promise<PortalContext | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
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

export function isResponse(value: PortalContext | NextResponse): value is NextResponse {
  return !("tenantId" in value);
}

export function denyUnless(ctx: PortalContext, privilege: Privilege): NextResponse | null {
  if (can(ctx.role, privilege)) return null;
  return NextResponse.json({ error: "You do not have permission for this action." }, { status: 403 });
}
