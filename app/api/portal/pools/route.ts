import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { addPoolMembers, createPool } from "@/lib/portal/repo";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "pool.create");
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      name?: string;
      type?: string;
      capMb?: number;
      iccids?: string[];
    };
    if (!body.name?.trim()) return NextResponse.json({ error: "Pool name is required." }, { status: 400 });
    const pool = await createPool(ctx.tenantId, ctx.email, {
      name: body.name.trim(),
      type: body.type || "Fleet data",
      capMb: Number(body.capMb) || 10240,
    });
    if (body.iccids?.length) {
      await addPoolMembers(ctx.tenantId, ctx.email, pool.id, body.iccids);
    }
    return NextResponse.json({ success: true, pool });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Pool failed." }, { status: 400 });
  }
}
