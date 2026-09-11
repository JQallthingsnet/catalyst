import { NextResponse } from "next/server";
import { isResponse, requirePortalApi } from "@/lib/portal/api";
import { createAndSendInvite, inviteableRoles } from "@/lib/portal/invites";
import { parseViewRole } from "@/lib/portal/role-model";
import { setActingTenantCookie } from "@/lib/portal/roles";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  try {
    const body = (await request.json()) as { email?: string; role?: string; organisationName?: string };
    const role = parseViewRole(body.role);
    if (!role || !inviteableRoles(ctx.role).includes(role)) {
      return NextResponse.json({ error: "You cannot invite that role." }, { status: 403 });
    }
    const origin = new URL(request.url).origin;
    const created = await createAndSendInvite({
      ctx,
      email: body.email ?? "",
      role,
      signInUrl: origin,
      organisationName: body.organisationName,
    });
    if (body.organisationName?.trim() && ctx.isSuperAdmin) {
      await setActingTenantCookie(created.tenantId);
    }
    return NextResponse.json({ success: true, tenantId: created.tenantId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invite failed." }, { status: 400 });
  }
}
