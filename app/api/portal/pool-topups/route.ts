import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { createPoolModemTopup, listPoolModemTopups, sydneyMonthKey } from "@/lib/portal/pool-topups";

export async function GET(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "pool.view");
  if (denied) return denied;

  if (ctx.role === "super_admin") {
    return NextResponse.json(
      { error: "Pool top-ups are shown under Invoices in reseller admin view." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const monthKey = url.searchParams.get("month")?.trim() || undefined;
  const items = await listPoolModemTopups({
    tenantId: ctx.tenantId,
    monthKey,
  });
  return NextResponse.json({ monthKey: monthKey || sydneyMonthKey(), items });
}

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "pool.create");
  if (denied) return denied;

  if (ctx.role === "super_admin") {
    return NextResponse.json(
      { error: "Buy pool top-up as reseller admin for an organisation." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as { modemId?: string; simUnits?: number };
    const topup = await createPoolModemTopup({
      tenantId: ctx.tenantId,
      modemId: body.modemId ?? "",
      simUnits: Number(body.simUnits),
      actorEmail: ctx.email,
    });
    return NextResponse.json({ success: true, topup });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not buy pool top-up." },
      { status: 400 },
    );
  }
}
