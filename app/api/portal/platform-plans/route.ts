import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import {
  assignPlatformPlanToTenant,
  createPlatformPlan,
  deletePlatformPlan,
  setDefaultContractPlan,
  setPlatformPlanActive,
  unassignPlatformPlanFromTenant,
} from "@/lib/portal/platform-plans";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.plan");
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      name?: string;
      supplier?: string;
      ccRatePlan?: string;
      commPlan?: string;
      resellerIds?: string[];
      tenantId?: string;
      platformPlanId?: string;
      action?: string;
    };
    if (body.action === "unassign" && body.tenantId && body.platformPlanId) {
      await unassignPlatformPlanFromTenant(ctx.email, body.tenantId, body.platformPlanId);
      return NextResponse.json({ success: true });
    }
    if (body.action === "setDefault" && body.tenantId && body.platformPlanId) {
      await setDefaultContractPlan(ctx.email, body.tenantId, body.platformPlanId);
      return NextResponse.json({ success: true });
    }
    if (body.tenantId && body.platformPlanId) {
      await assignPlatformPlanToTenant(ctx.email, body.tenantId, body.platformPlanId, ctx.homeTenantId);
      return NextResponse.json({ success: true });
    }
    const plan = await createPlatformPlan(
      ctx.email,
      {
        name: body.name ?? "",
        supplier: body.supplier ?? "Optus",
        ccRatePlan: body.ccRatePlan ?? "",
        commPlan: body.commPlan ?? "",
        resellerIds: body.resellerIds ?? [],
      },
      ctx.homeTenantId,
    );
    return NextResponse.json({ success: true, plan });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Plan failed." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.plan");
  if (denied) return denied;
  try {
    const body = (await request.json()) as { platformPlanId?: string; active?: boolean };
    if (!body.platformPlanId || typeof body.active !== "boolean") {
      return NextResponse.json({ error: "platformPlanId and active are required." }, { status: 400 });
    }
    const plan = await setPlatformPlanActive(body.platformPlanId, body.active);
    return NextResponse.json({ success: true, plan });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.plan");
  if (denied) return denied;
  try {
    const body = (await request.json()) as { platformPlanId?: string; confirmName?: string };
    if (!body.platformPlanId) {
      return NextResponse.json({ error: "platformPlanId is required." }, { status: 400 });
    }
    const plan = await deletePlatformPlan(body.platformPlanId, body.confirmName ?? "");
    return NextResponse.json({ success: true, plan });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed." }, { status: 400 });
  }
}
