import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { requestLifecycle } from "@/lib/portal/lifecycle-requests";
import { applyLifecycle } from "@/lib/portal/repo";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "lifecycle");
  if (denied) return denied;
  try {
    const body = (await request.json()) as { iccid?: string; action?: string };
    // Super admin (platform view): apply locally. Reseller admin/operator: queue for ATN bulk email.
    if (ctx.role === "super_admin") {
      const state = await applyLifecycle(ctx.tenantId, ctx.email, {
        iccid: body.iccid ?? "",
        action: body.action ?? "",
      });
      return NextResponse.json({ success: true, mode: "applied", state });
    }

    const result = await requestLifecycle(ctx.tenantId, ctx.email, {
      iccid: body.iccid ?? "",
      action: body.action ?? "",
    });
    return NextResponse.json({
      success: true,
      mode: "requested",
      ...result,
      message: `Queued for ATN — ${result.pendingCount} pending request${result.pendingCount === 1 ? "" : "s"}. See Logs → Lifecycle request.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Lifecycle failed." }, { status: 400 });
  }
}
