import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { notifySimAllowanceAlerts } from "@/lib/portal/sim-usage";

/** Super admin: send (or resend) today's ≥80% rate-plan digest to Jerry Qiu. */
export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "pool.create");
  if (denied) return denied;
  if (ctx.role !== "super_admin") {
    return NextResponse.json({ error: "Only super admin can send the usage digest." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  const result = await notifySimAllowanceAlerts(undefined, { force: body.force !== false });
  if (result.error) {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}
