import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import {
  clearModemAllowance,
  listModemAllowances,
  listPoolCustomerLatest,
  listPoolCustomerSeries,
  setModemAllowance,
  snapshotPoolCustomerDaily,
} from "@/lib/portal/pools";

export async function GET(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "pool.view");
  if (denied) return denied;

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "latest";
  const customer = url.searchParams.get("customer") ?? "";

  if (view === "modems") {
    return NextResponse.json({ modems: await listModemAllowances(customer) });
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
        fromDay: url.searchParams.get("from") ?? undefined,
        toDay: url.searchParams.get("to") ?? undefined,
      }),
    });
  }
  return NextResponse.json({ customers: await listPoolCustomerLatest(customer) });
}

export async function PUT(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "pool.create");
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      modemId?: string;
      allowanceMb?: number | null;
      clear?: boolean;
    };
    if (!body.modemId?.trim()) {
      return NextResponse.json({ error: "modem_ID is required." }, { status: 400 });
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
    const n = await snapshotPoolCustomerDaily(body.day?.trim() || undefined);
    return NextResponse.json({ success: true, customers: n });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Snapshot failed." },
      { status: 400 },
    );
  }
}
