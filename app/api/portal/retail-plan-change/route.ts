import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { changeSimRetailPlan } from "@/lib/portal/repo";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "assign");
  if (denied) return denied;
  try {
    const body = (await request.json()) as { iccid?: string; planId?: string };
    const result = await changeSimRetailPlan(ctx.tenantId, ctx.email, {
      iccid: body.iccid ?? "",
      planId: body.planId ?? "",
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Retail plan change failed." },
      { status: 400 },
    );
  }
}
