import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { createPlan } from "@/lib/portal/repo";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "plan.create");
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      name?: string;
      type?: string;
      inclusiveMb?: number;
      overage?: string;
      roaming?: string;
      wholesalePlan?: string;
      commPlan?: string;
    };
    if (!body.name?.trim()) return NextResponse.json({ error: "Plan name is required." }, { status: 400 });
    const plan = await createPlan(ctx.tenantId, ctx.email, {
      name: body.name.trim(),
      type: body.type || "Telematics",
      inclusiveMb: Number(body.inclusiveMb) || 50,
      overage: body.overage || "throttle",
      roaming: body.roaming || "AU/NZ",
      wholesalePlan: body.wholesalePlan || "T50",
      commPlan: body.commPlan || "data",
    });
    return NextResponse.json({ success: true, plan });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Plan failed." }, { status: 400 });
  }
}
