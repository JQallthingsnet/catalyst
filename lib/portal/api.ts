import { ensureAuthSchema } from "@/lib/auth/schema";
import { getSession } from "@/lib/auth/session";
import { resolvePortalContext } from "@/lib/portal/access";
import { can, type Privilege } from "@/lib/portal/roles";
import { ensurePortalSchema } from "@/lib/portal/schema";
import type { PortalContext } from "@/lib/portal/repo";
import { NextResponse } from "next/server";

export async function requirePortalApi(): Promise<PortalContext | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  await ensureAuthSchema();
  await ensurePortalSchema();
  return resolvePortalContext(session.email);
}

export function isResponse(value: PortalContext | NextResponse): value is NextResponse {
  return !("tenantId" in value);
}

export function denyUnless(ctx: PortalContext, privilege: Privilege): NextResponse | null {
  if (can(ctx.role, privilege)) return null;
  return NextResponse.json({ error: "You do not have permission for this action." }, { status: 403 });
}
