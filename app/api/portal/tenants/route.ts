import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { writeAudit } from "@/lib/portal/repo";
import {
  deleteResellerOrganisation,
  renameResellerOrganisation,
  setTenantActive,
} from "@/lib/portal/tenant";

export async function PATCH(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "admin");
  if (denied) return denied;
  if (!ctx.isSuperAdmin || ctx.role !== "super_admin") {
    return NextResponse.json({ error: "Only a super admin can manage organisations." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { tenantId?: string; name?: string; active?: boolean };
    const tenantId = body.tenantId?.trim() ?? "";

    if (typeof body.active === "boolean") {
      const tenant = await setTenantActive(tenantId, body.active, ctx.homeTenantId);
      await writeAudit(
        tenant.id,
        ctx.email,
        "tenant",
        body.active ? `Reactivated organisation ${tenant.name}` : `Deactivated organisation ${tenant.name}`,
      );
      return NextResponse.json({ success: true, tenant });
    }

    const name = body.name?.trim() ?? "";
    const tenant = await renameResellerOrganisation(tenantId, name, ctx.homeTenantId);
    await writeAudit(tenant.id, ctx.email, "tenant", `Renamed organisation to ${tenant.name}`);
    return NextResponse.json({ success: true, tenant });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "admin");
  if (denied) return denied;
  if (!ctx.isSuperAdmin || ctx.role !== "super_admin") {
    return NextResponse.json({ error: "Only a super admin can delete organisations." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { tenantId?: string; confirmName?: string };
    const tenantId = body.tenantId?.trim() ?? "";
    const confirmName = body.confirmName ?? "";
    const deleted = await deleteResellerOrganisation(tenantId, ctx.homeTenantId, confirmName);
    // Audit on platform home — the reseller tenant row is gone.
    await writeAudit(
      ctx.homeTenantId,
      ctx.email,
      "tenant",
      `Deleted organisation ${deleted.name} (${deleted.id})`,
    );
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed." }, { status: 400 });
  }
}
