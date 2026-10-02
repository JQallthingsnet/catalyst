import { NextResponse } from "next/server";
import { isResponse, requirePortalApi } from "@/lib/portal/api";
import {
  clearActingTenantCookie,
  parseViewRole,
  setActingTenantCookie,
  setViewAsCookie,
} from "@/lib/portal/roles";
import { excludeHomeTenant, listTenantOptions } from "@/lib/portal/tenant";

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

  if (role === "super_admin") {
    await clearActingTenantCookie();
    return NextResponse.json({ success: true, role, tenantId: ctx.homeTenantId });
  }

  // Reseller preview must land on a real reseller, never ATN Platform.
  if (ctx.tenantId !== ctx.homeTenantId) {
    return NextResponse.json({ success: true, role, tenantId: ctx.tenantId });
  }

  const resellers = excludeHomeTenant(await listTenantOptions(), ctx.homeTenantId);
  if (resellers[0]) {
    await setActingTenantCookie(resellers[0].id);
    return NextResponse.json({ success: true, role, tenantId: resellers[0].id });
  }

  await clearActingTenantCookie();
  return NextResponse.json({
    success: true,
    role,
    tenantId: ctx.homeTenantId,
    warning: "No reseller organisations yet. Create one from Admin first.",
  });
}
