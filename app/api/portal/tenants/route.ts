import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { writeAudit } from "@/lib/portal/repo";
import { renameResellerOrganisation } from "@/lib/portal/tenant";

export async function PATCH(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "admin");
  if (denied) return denied;
  if (!ctx.isSuperAdmin || ctx.role !== "super_admin") {
    return NextResponse.json({ error: "Only a super admin can rename organisations." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { tenantId?: string; name?: string };
    const tenantId = body.tenantId?.trim() ?? "";
    const name = body.name?.trim() ?? "";
    const tenant = await renameResellerOrganisation(tenantId, name, ctx.homeTenantId);
    await writeAudit(tenant.id, ctx.email, "tenant", `Renamed organisation to ${tenant.name}`);
    return NextResponse.json({ success: true, tenant });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Rename failed." }, { status: 400 });
  }
}
