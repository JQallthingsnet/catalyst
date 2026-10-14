import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { sendDemoTopSimAllowanceEmail } from "@/lib/portal/sim-usage";

export async function POST() {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "pool.create");
  if (denied) return denied;

  try {
    const result = await sendDemoTopSimAllowanceEmail(10);
    if (!result.sent) {
      return NextResponse.json(
        {
          error:
            result.count === 0
              ? "No SIMs with a modem allowance to include."
              : "Email send failed. Check gmail-smtp-keys.",
          ...result,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Demo email failed." },
      { status: 400 },
    );
  }
}
