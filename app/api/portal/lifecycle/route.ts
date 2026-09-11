import { NextResponse } from "next/server";
import { isResponse, requirePortalApi } from "@/lib/portal/api";
import { applyLifecycle } from "@/lib/portal/repo";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  try {
    const body = (await request.json()) as { iccid?: string; action?: string };
    const state = await applyLifecycle(ctx.tenantId, ctx.email, {
      iccid: body.iccid ?? "",
      action: body.action ?? "",
    });
    return NextResponse.json({ success: true, state });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Lifecycle failed." }, { status: 400 });
  }
}
