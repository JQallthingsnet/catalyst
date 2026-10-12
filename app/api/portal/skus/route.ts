import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import {
  assignSkuToTenant,
  createSimSku,
  deleteSimSku,
  setSimSkuActive,
  unassignSkuFromTenant,
  updateSimSku,
} from "@/lib/portal/skus";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  try {
    const body = (await request.json()) as {
      action?: string;
      tenantId?: string;
      skuId?: string;
      name?: string;
      formFactor?: string;
      tech?: string;
      region?: string;
      blurb?: string;
    };

    if (body.action === "assign" || body.action === "unassign") {
      const denied = denyUnless(ctx, "platform.plan");
      if (denied) return denied;
      if (!body.tenantId || !body.skuId) {
        return NextResponse.json({ error: "tenantId and skuId are required." }, { status: 400 });
      }
      if (body.action === "assign") await assignSkuToTenant(body.tenantId, body.skuId);
      else await unassignSkuFromTenant(body.tenantId, body.skuId);
      return NextResponse.json({ success: true });
    }

    const denied = denyUnless(ctx, "platform.catalogue");
    if (denied) return denied;
    const sku = await createSimSku(body);
    return NextResponse.json({ success: true, sku });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.catalogue");
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      id?: string;
      name?: string;
      formFactor?: string;
      tech?: string;
      region?: string;
      blurb?: string;
      active?: boolean;
    };
    if (!body.id) throw new Error("Missing catalogue item.");
    if (typeof body.active === "boolean") {
      const sku = await setSimSkuActive(body.id, body.active);
      return NextResponse.json({ success: true, sku });
    }
    const sku = await updateSimSku(body.id, body);
    return NextResponse.json({ success: true, sku });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.catalogue");
  if (denied) return denied;
  try {
    const body = (await request.json()) as { id?: string; confirmName?: string };
    if (!body.id) throw new Error("Missing catalogue item.");
    await deleteSimSku(body.id, body.confirmName);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed." }, { status: 400 });
  }
}
