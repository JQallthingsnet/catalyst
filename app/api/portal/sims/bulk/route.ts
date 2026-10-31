import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import {
  createSimBulkJob,
  processSimBulkJobChunk,
  type BulkJobKind,
} from "@/lib/portal/sim-bulk";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;

  try {
    const body = (await request.json()) as {
      kind?: string;
      iccids?: string[];
      platformPlanId?: string;
    };
    const kind = body.kind as BulkJobKind | undefined;
    if (kind === "rate_plan") {
      const denied = denyUnless(ctx, "rate_plan.change");
      if (denied) return denied;
    } else {
      const denied = denyUnless(ctx, "lifecycle");
      if (denied) return denied;
    }

    const job = await createSimBulkJob(ctx.tenantId, ctx.email, {
      kind: kind as BulkJobKind,
      iccids: body.iccids ?? [],
      platformPlanId: body.platformPlanId,
    });

    // Kick the first chunk immediately so progress starts on create.
    const progressed = await processSimBulkJobChunk(ctx.tenantId, ctx.email, job.id);
    return NextResponse.json({ success: true, job: progressed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bulk update failed." },
      { status: 400 },
    );
  }
}
