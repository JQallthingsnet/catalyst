import { NextResponse } from "next/server";
import { probeCcAccounts } from "@/lib/cc/accounts";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";

export async function POST() {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.estate");
  if (denied) return denied;
  try {
    const result = await probeCcAccounts();
    return NextResponse.json({ success: !result.error, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Account probe failed." },
      { status: 400 },
    );
  }
}
