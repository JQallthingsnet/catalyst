import { ensureAuthSchema } from "@/lib/auth/schema";
import { getSession } from "@/lib/auth/session";
import { getOrCreatePortalContext, type PortalContext } from "@/lib/portal/repo";
import { ensurePortalSchema } from "@/lib/portal/schema";
import { NextResponse } from "next/server";

export async function requirePortalApi(): Promise<PortalContext | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  await ensureAuthSchema();
  await ensurePortalSchema();
  return getOrCreatePortalContext(session.email);
}

export function isResponse(value: PortalContext | NextResponse): value is NextResponse {
  return !("tenantId" in value);
}
