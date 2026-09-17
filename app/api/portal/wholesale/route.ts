import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { allocateWholesaleStock } from "@/lib/portal/repo";
import { setActingTenantCookie } from "@/lib/portal/roles";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "wholesale.allocate");
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      tenantId?: string;
      skuId?: string;
      quantity?: number;
      platformPlanId?: string;
    };
    const order = await allocateWholesaleStock(ctx, {
      tenantId: body.tenantId ?? "",
      skuId: body.skuId ?? "",
      quantity: Number(body.quantity),
      platformPlanId: body.platformPlanId ?? "",
    });
    if (order.tenantId) await setActingTenantCookie(order.tenantId);
    return NextResponse.json({ success: true, order });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Allocation failed." }, { status: 400 });
  }
}
