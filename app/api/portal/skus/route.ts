import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { createSimSku, deleteSimSku, setSimSkuActive, updateSimSku } from "@/lib/portal/skus";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.catalogue");
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      name?: string;
      formFactor?: string;
      tech?: string;
      region?: string;
      blurb?: string;
    };
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
