import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { createCustomer, renameTenant } from "@/lib/portal/repo";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  try {
    const body = (await request.json()) as { name?: string; kind?: string };
    if (body.kind === "tenant") {
      const denied = denyUnless(ctx, "settings");
      if (denied) return denied;
      if (!body.name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
      await renameTenant(ctx.tenantId, body.name.trim());
      return NextResponse.json({ success: true });
    }
    const denied = denyUnless(ctx, "customer.create");
    if (denied) return denied;
    if (!body.name?.trim()) return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
    const customer = await createCustomer(ctx.tenantId, ctx.email, body.name.trim());
    return NextResponse.json({ success: true, customer });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed." }, { status: 400 });
  }
}
