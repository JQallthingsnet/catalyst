import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import {
  createCustomer,
  deleteCustomer,
  renameCustomer,
  renameTenant,
} from "@/lib/portal/repo";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  try {
    const body = (await request.json()) as {
      name?: string;
      kind?: string;
      id?: string;
      action?: string;
    };
    if (body.kind === "tenant") {
      const denied = denyUnless(ctx, "settings");
      if (denied) return denied;
      if (!body.name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
      await renameTenant(ctx.tenantId, body.name.trim());
      return NextResponse.json({ success: true });
    }

    const denied = denyUnless(ctx, "customer.create");
    if (denied) return denied;

    if (body.action === "rename") {
      if (!body.id?.trim()) return NextResponse.json({ error: "Customer id is required." }, { status: 400 });
      if (!body.name?.trim()) {
        return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
      }
      const customer = await renameCustomer(ctx.tenantId, ctx.email, body.id.trim(), body.name.trim());
      return NextResponse.json({ success: true, customer });
    }

    if (body.action === "delete") {
      if (!body.id?.trim()) return NextResponse.json({ error: "Customer id is required." }, { status: 400 });
      const result = await deleteCustomer(ctx.tenantId, ctx.email, body.id.trim());
      return NextResponse.json({ success: true, ...result });
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
    }
    const customer = await createCustomer(ctx.tenantId, ctx.email, body.name.trim(), {
      homeTenantId: ctx.homeTenantId,
      isSuperAdmin: ctx.isSuperAdmin,
    });
    return NextResponse.json({ success: true, customer });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed." }, { status: 400 });
  }
}
