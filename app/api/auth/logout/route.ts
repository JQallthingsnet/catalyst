import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";
import { clearActingTenantCookie, clearViewAsCookie } from "@/lib/portal/roles";

export async function POST() {
  await clearSessionCookie();
  await clearViewAsCookie();
  await clearActingTenantCookie();
  return NextResponse.json({ success: true });
}
