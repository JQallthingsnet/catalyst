import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { resolvePoolCustomerScope } from "@/lib/portal/pool-scope";
import {
  clearModemAllowance,
  clearRatePlanAllowance,
  listModemAllowances,
  listPoolModemLatest,
  listPoolModemSeries,
  listRatePlanAllowances,
  setModemAllowance,
  setRatePlanAllowance,
  snapshotPoolCustomerDaily,
  toPoolEntityFromModem,
} from "@/lib/portal/pools";

export async function GET(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "pool.view");
  if (denied) return denied;

  const scope = await resolvePoolCustomerScope(ctx);
  const platformView = scope.unrestricted;
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "latest";
  const q = url.searchParams.get("customer") ?? url.searchParams.get("q") ?? "";

  if (view === "modems") {
    if (ctx.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only super admin can view Reseller Plan allowances." },
        { status: 403 },
      );
    }
    return NextResponse.json({
      modems: await listModemAllowances({ q }),
    });
  }
  if (view === "rate_plans") {
    if (ctx.role !== "super_admin") {
      return NextResponse.json({ error: "Only super admin can view rate plan allowances." }, { status: 403 });
    }
    return NextResponse.json({ ratePlans: await listRatePlanAllowances() });
  }
  if (view === "series") {
    const keysParam = url.searchParams.get("keys") ?? url.searchParams.get("customers") ?? "";
    const keys = keysParam
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    // Platform + reseller both plot by modem_ID (reseller scoped to bound CC customer).
    const series = await listPoolModemSeries({
      modemIds: keys.length ? keys : undefined,
      exactCustomer: platformView ? undefined : scope.exactCustomer,
      fromDay: url.searchParams.get("from") ?? undefined,
      toDay: url.searchParams.get("to") ?? undefined,
    });
    return NextResponse.json({
      series: series.map((point) => ({
        name: point.modemId,
        day: point.day,
        ctdUsageMb: point.ctdUsageMb,
        allowanceMb: point.allowanceMb,
      })),
    });
  }

  return NextResponse.json({
    rows: (
      await listPoolModemLatest({
        q,
        exactCustomer: platformView ? undefined : scope.exactCustomer,
      })
    ).map(toPoolEntityFromModem),
  });
}

export async function PUT(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "pool.create");
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      modemId?: string;
      ratePlan?: string;
      allowanceMb?: number | null;
      clear?: boolean;
    };
    if (body.ratePlan?.trim()) {
      if (ctx.role !== "super_admin") {
        return NextResponse.json({ error: "Only super admin can edit rate plan allowances." }, { status: 403 });
      }
      if (body.clear || body.allowanceMb == null) {
        await clearRatePlanAllowance(body.ratePlan);
      } else {
        await setRatePlanAllowance(body.ratePlan, Number(body.allowanceMb), ctx.email);
      }
      return NextResponse.json({ success: true });
    }
    if (!body.modemId?.trim()) {
      return NextResponse.json({ error: "Reseller Plan or rate plan is required." }, { status: 400 });
    }
    if (ctx.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only super admin can edit Reseller Plan allowances." },
        { status: 403 },
      );
    }
    if (body.clear || body.allowanceMb == null) {
      await clearModemAllowance(body.modemId);
    } else {
      await setModemAllowance(body.modemId, Number(body.allowanceMb), ctx.email);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save allowance." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "pool.create");
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => ({}))) as { day?: string };
    const scope = await resolvePoolCustomerScope(ctx);
    const n = await snapshotPoolCustomerDaily(
      body.day?.trim() || undefined,
      scope.unrestricted ? undefined : { customers: [scope.exactCustomer] },
    );
    return NextResponse.json({ success: true, customers: n });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Snapshot failed." },
      { status: 400 },
    );
  }
}
