import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { getOrderNotifySetting, saveOrderNotifySetting } from "@/lib/portal/order-notify";

export async function GET() {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "alerts.manage");
  if (denied) return denied;
  if (ctx.role !== "super_admin") {
    return NextResponse.json({ error: "Only super admin configures order notifications." }, { status: 403 });
  }

  const setting = await getOrderNotifySetting();
  return NextResponse.json({ setting });
}

export async function PUT(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "alerts.manage");
  if (denied) return denied;
  if (ctx.role !== "super_admin") {
    return NextResponse.json({ error: "Only super admin configures order notifications." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { recipients?: string | string[] };
  try {
    const setting = await saveOrderNotifySetting({
      recipients: body.recipients ?? [],
      updatedBy: ctx.email,
    });
    return NextResponse.json({ setting });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save order notification settings." },
      { status: 400 },
    );
  }
}
