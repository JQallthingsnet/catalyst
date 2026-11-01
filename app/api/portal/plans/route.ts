import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { createPlan, deletePlan, renamePlan } from "@/lib/portal/repo";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  try {
    const body = (await request.json()) as {
      name?: string;
      platformPlanId?: string;
      inclusiveMb?: number;
      pricePerSim?: number;
      id?: string;
      action?: string;
    };

    if (body.action === "rename") {
      const denied = denyUnless(ctx, "plan.edit");
      if (denied) return denied;
      if (!body.id?.trim()) return NextResponse.json({ error: "Plan id is required." }, { status: 400 });
      if (!body.name?.trim()) {
        return NextResponse.json({ error: "Retail plan name is required." }, { status: 400 });
      }
      const plan = await renamePlan(ctx.tenantId, ctx.email, body.id.trim(), body.name.trim());
      return NextResponse.json({ success: true, plan });
    }

    if (body.action === "delete") {
      const denied = denyUnless(ctx, "plan.edit");
      if (denied) return denied;
      if (!body.id?.trim()) return NextResponse.json({ error: "Plan id is required." }, { status: 400 });
      const result = await deletePlan(ctx.tenantId, ctx.email, body.id.trim());
      return NextResponse.json({ success: true, ...result });
    }

    const denied = denyUnless(ctx, "plan.create");
    if (denied) return denied;
    if (!body.name?.trim()) return NextResponse.json({ error: "Plan name is required." }, { status: 400 });
    const plan = await createPlan(ctx.tenantId, ctx.email, {
      name: body.name.trim(),
      platformPlanId: body.platformPlanId ?? "",
      inclusiveMb: Number(body.inclusiveMb),
      pricePerSim: Number(body.pricePerSim),
    });
    return NextResponse.json({ success: true, plan });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Plan failed." }, { status: 400 });
  }
}
