import { NextResponse } from "next/server";
import { isResponse, requirePortalApi } from "@/lib/portal/api";
import { assignSims } from "@/lib/portal/repo";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  try {
    const body = (await request.json()) as {
      customerId?: string;
      planId?: string;
      poolId?: string;
      iccids?: string[];
    };
    const result = await assignSims(ctx.tenantId, ctx.email, {
      customerId: body.customerId ?? "",
      planId: body.planId ?? "",
      poolId: body.poolId,
      iccids: body.iccids ?? [],
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Assign failed." }, { status: 400 });
  }
}
