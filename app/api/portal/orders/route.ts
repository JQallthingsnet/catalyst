import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { advanceOrderSims, cancelOrderSims, createOrder } from "@/lib/portal/repo";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "order.create");
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      action?: string;
      orderId?: string;
      skuId?: string;
      quantity?: number;
      logistics?: string;
      destination?: string;
      poNumber?: string;
    };

    if (body.action === "revoke" || body.action === "cancel") {
      await cancelOrderSims(ctx, body.orderId ?? "");
      return NextResponse.json({ success: true });
    }

    if (body.action === "advance") {
      const result = await advanceOrderSims(ctx, body.orderId ?? "");
      return NextResponse.json({ success: true, ...result });
    }

    const order = await createOrder(ctx.tenantId, ctx, {
      skuId: body.skuId ?? "",
      quantity: Number(body.quantity),
      logistics: body.logistics?.trim() || "Warehouse AU",
      destination: body.destination,
      poNumber: body.poNumber,
    });
    return NextResponse.json({ success: true, order });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Order failed." }, { status: 400 });
  }
}
