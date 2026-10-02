import { NextResponse } from "next/server";
import { isResponse, requirePortalApi } from "@/lib/portal/api";
import { applyPortalCookies } from "@/lib/portal/roles";
import { loadTenant } from "@/lib/portal/tenant";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  if (!ctx.isSuperAdmin) {
    return NextResponse.json({ error: "Only super admins can switch organisation." }, { status: 403 });
  }

  const body = (await request.json()) as { tenantId?: string | null; viewAsReseller?: boolean };
  const tenantId = body.tenantId?.trim() || null;

  // Back to ATN Platform (super admin scope).
  if (!tenantId || tenantId === ctx.homeTenantId) {
    if (ctx.role !== "super_admin") {
      return NextResponse.json(
        { error: "While viewing as a reseller, choose a reseller organisation — not ATN Platform." },
        { status: 400 },
      );
    }
    return applyPortalCookies(NextResponse.json({ success: true, tenantId: ctx.homeTenantId }), {
      actingTenantId: null,
    });
  }

  const tenant = await loadTenant(tenantId);
  if (!tenant) return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
  if (tenant.id === ctx.homeTenantId) {
    return NextResponse.json({ error: "ATN Platform is not a reseller organisation." }, { status: 400 });
  }

  const openAsReseller = ctx.role === "super_admin" || Boolean(body.viewAsReseller);
  return applyPortalCookies(
    NextResponse.json({
      success: true,
      tenantId: tenant.id,
      role: openAsReseller ? "reseller_admin" : ctx.role,
    }),
    {
      actingTenantId: tenant.id,
      viewAs: openAsReseller ? "reseller_admin" : undefined,
    },
  );
}
