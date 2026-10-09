import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { ensurePortalSchema } from "@/lib/portal/schema";
import {
  beginCcCatchUp,
  getCcCatchUpProgress,
  runCcCatchUpBatch,
} from "@/lib/cc/devices";

/** Progress for Sync now catch-up UI. */
export async function GET() {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.estate");
  if (denied) return denied;
  await ensurePortalSchema();
  try {
    const progress = await getCcCatchUpProgress();
    return NextResponse.json({ success: true, progress });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Status failed." },
      { status: 400 },
    );
  }
}

/**
 * Sync now catch-up batch.
 * Body: { action?: "start" | "batch" } — start opens/resumes the wide Search window and turns Auto poll off;
 * batch (default after start) fetches the next pages. UI chains until complete.
 */
export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.estate");
  if (denied) return denied;
  await ensurePortalSchema();

  let action: "start" | "batch" = "batch";
  try {
    const body = (await request.json()) as { action?: unknown };
    if (body.action === "start") action = "start";
  } catch {
    // empty body = batch
  }

  try {
    if (action === "start") {
      const progress = await beginCcCatchUp();
      return NextResponse.json({ success: true, progress, started: true });
    }
    const result = await runCcCatchUpBatch();
    return NextResponse.json({ success: true, result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed." }, { status: 400 });
  }
}
