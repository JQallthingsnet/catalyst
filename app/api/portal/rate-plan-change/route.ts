import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { changeSimRatePlan } from "@/lib/portal/rate-plan-change";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "rate_plan.change");
  if (denied) return denied;
  try {
    const body = (await request.json()) as { iccid?: string; platformPlanId?: string };
    const result = await changeSimRatePlan(ctx.tenantId, ctx.email, {
      iccid: body.iccid ?? "",
      platformPlanId: body.platformPlanId ?? "",
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rate plan change failed." },
      { status: 400 },
    );
  }
}
