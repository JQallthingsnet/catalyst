import { NextResponse } from "next/server";
import { isResponse, requirePortalApi } from "@/lib/portal/api";
import { parseViewRole, setViewAsCookie } from "@/lib/portal/roles";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  if (!ctx.isSuperAdmin) {
    return NextResponse.json({ error: "Only super admins can change view." }, { status: 403 });
  }
  const body = (await request.json()) as { role?: string };
  const role = parseViewRole(body.role);
  if (!role) return NextResponse.json({ error: "Unknown role." }, { status: 400 });
  await setViewAsCookie(role);
  return NextResponse.json({ success: true, role });
}
