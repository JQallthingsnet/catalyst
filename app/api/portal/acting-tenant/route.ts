import { NextResponse } from "next/server";
import { isResponse, requirePortalApi } from "@/lib/portal/api";
import { clearActingTenantCookie, setActingTenantCookie } from "@/lib/portal/roles";
import { loadTenant } from "@/lib/portal/tenant";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  if (!ctx.isSuperAdmin) {
    return NextResponse.json({ error: "Only super admins can switch organisation." }, { status: 403 });
  }

  const body = (await request.json()) as { tenantId?: string | null };
  const tenantId = body.tenantId?.trim() || null;
  if (!tenantId || tenantId === ctx.homeTenantId) {
    await clearActingTenantCookie();
    return NextResponse.json({ success: true, tenantId: ctx.homeTenantId });
  }

  const tenant = await loadTenant(tenantId);
  if (!tenant) return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
  await setActingTenantCookie(tenant.id);
  return NextResponse.json({ success: true, tenantId: tenant.id });
}
