import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { assignPlatformPlanToTenant, createPlatformPlan } from "@/lib/portal/platform-plans";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.plan");
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      name?: string;
      ccRatePlan?: string;
      commPlan?: string;
      tenantId?: string;
      platformPlanId?: string;
    };
    if (body.tenantId && body.platformPlanId) {
      await assignPlatformPlanToTenant(ctx.email, body.tenantId, body.platformPlanId);
      return NextResponse.json({ success: true });
    }
    const plan = await createPlatformPlan(ctx.email, {
      name: body.name ?? "",
      ccRatePlan: body.ccRatePlan ?? "",
      commPlan: body.commPlan ?? "data",
    });
    return NextResponse.json({ success: true, plan });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Plan failed." }, { status: 400 });
  }
}
