import { NextResponse } from "next/server";
import { isResponse, requirePortalApi } from "@/lib/portal/api";
import { createOrder } from "@/lib/portal/repo";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  try {
    const body = (await request.json()) as {
      skuId?: string;
      quantity?: number;
      logistics?: string;
      destination?: string;
    };
    const order = await createOrder(ctx.tenantId, ctx.email, {
      skuId: body.skuId ?? "",
      quantity: Number(body.quantity),
      logistics: body.logistics?.trim() || "Warehouse AU",
      destination: body.destination,
    });
    return NextResponse.json({ success: true, order });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Order failed." }, { status: 400 });
  }
}
