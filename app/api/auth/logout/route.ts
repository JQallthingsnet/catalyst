import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";
import { clearViewAsCookie } from "@/lib/portal/roles";

export async function POST() {
  await clearSessionCookie();
  await clearViewAsCookie();
  return NextResponse.json({ success: true });
}
