import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { addSuperAdmin, listSuperAdmins } from "@/lib/portal/roles";

export async function GET() {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  if (!ctx.isSuperAdmin) return NextResponse.json({ error: "Only super admins can manage admins." }, { status: 403 });
  const denied = denyUnless(ctx, "admin");
  if (denied) return denied;
  return NextResponse.json({ admins: await listSuperAdmins() });
}

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  if (!ctx.isSuperAdmin) return NextResponse.json({ error: "Only super admins can manage admins." }, { status: 403 });
  const denied = denyUnless(ctx, "admin");
  if (denied) return denied;
  try {
    const body = (await request.json()) as { email?: string };
    await addSuperAdmin(body.email ?? "", ctx.email);
    return NextResponse.json({ success: true, admins: await listSuperAdmins() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not add admin." }, { status: 400 });
  }
}
