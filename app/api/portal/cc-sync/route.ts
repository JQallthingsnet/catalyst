import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { ensurePortalSchema } from "@/lib/portal/schema";
import { syncCcDevices } from "@/lib/cc/devices";

export async function POST() {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.estate");
  if (denied) return denied;
  await ensurePortalSchema();
  try {
    const result = await syncCcDevices();
    return NextResponse.json({ success: true, result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed." }, { status: 400 });
  }
}
