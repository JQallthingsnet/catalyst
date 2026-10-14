import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { resolvePoolCustomerScope } from "@/lib/portal/pool-scope";
import {
  clearModemAllowance,
  clearRatePlanAllowance,
  listModemAllowances,
  listPoolCustomerLatest,
  listPoolCustomerSeries,
  listRatePlanAllowances,
  setModemAllowance,
  setRatePlanAllowance,
  snapshotPoolCustomerDaily,
} from "@/lib/portal/pools";

export async function GET(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "pool.view");
  if (denied) return denied;

  const scope = await resolvePoolCustomerScope(ctx);
  const basis = scope.unrestricted ? ("rate_plan" as const) : ("modem" as const);
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "latest";
  const customer = url.searchParams.get("customer") ?? "";

  if (view === "modems") {
    if (ctx.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only super admin can view modem_ID allowances." },
        { status: 403 },
      );
    }
    return NextResponse.json({
      modems: await listModemAllowances({ q: customer }),
    });
  }
  if (view === "rate_plans") {
    if (ctx.role !== "super_admin") {
      return NextResponse.json({ error: "Only super admin can view rate plan allowances." }, { status: 403 });
    }
    return NextResponse.json({ ratePlans: await listRatePlanAllowances() });
  }
  if (view === "series") {
    const customersParam = url.searchParams.get("customers") ?? "";
    const customers = customersParam
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    return NextResponse.json({
      series: await listPoolCustomerSeries({
        customer: customers.length ? undefined : customer,
        customers: customers.length ? customers : undefined,
        allowedCustomers: scope.unrestricted ? undefined : [scope.exactCustomer],
        basis,
        fromDay: url.searchParams.get("from") ?? undefined,
        toDay: url.searchParams.get("to") ?? undefined,
      }),
    });
  }
  return NextResponse.json({
    customers: scope.unrestricted
      ? await listPoolCustomerLatest({ q: customer, basis })
      : await listPoolCustomerLatest({
          q: customer,
          exactCustomer: scope.exactCustomer,
          basis,
        }),
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
      return NextResponse.json({ error: "modem_ID or rate plan is required." }, { status: 400 });
    }
    if (ctx.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only super admin can edit modem_ID allowances." },
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
