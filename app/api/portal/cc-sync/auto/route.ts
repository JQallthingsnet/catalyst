import { after, NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { ensurePortalSchema } from "@/lib/portal/schema";
import { setCcAutoPoll, syncCcDevices } from "@/lib/cc/devices";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.estate");
  if (denied) return denied;
  await ensurePortalSchema();

  let enabled = false;
  try {
    const body = (await request.json()) as { enabled?: unknown };
    enabled = Boolean(body.enabled);
  } catch {
    return NextResponse.json({ error: "Send { enabled: true | false }." }, { status: 400 });
  }

  await setCcAutoPoll(enabled);
  if (enabled) {
    after(() =>
      syncCcDevices({ unlimited: true }).catch(() => {
        // last_error is stored on cc_sync_state
      }),
    );
  }
  return NextResponse.json({ success: true, autoPoll: enabled });
}
