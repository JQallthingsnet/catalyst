import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { can } from "@/lib/portal/role-model";
import {
  createSimBulkJob,
  processSimBulkJobChunk,
  type BulkJobItemInput,
} from "@/lib/portal/sim-bulk";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;

  try {
    const body = (await request.json()) as { items?: BulkJobItemInput[] };
    const items = body.items ?? [];
    const needsLifecycle = items.some(
      (item) => item.action === "Activate" || item.action === "Deactivate",
    );
    const needsPlan = items.some((item) => item.action === "rate_plan");
    if (needsLifecycle) {
      const denied = denyUnless(ctx, "lifecycle");
      if (denied) return denied;
    }
    if (needsPlan) {
      const denied = denyUnless(ctx, "rate_plan.change");
      if (denied) return denied;
    }
    if (!needsLifecycle && !needsPlan) {
      if (!can(ctx.role, "lifecycle") && !can(ctx.role, "rate_plan.change")) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }

    const job = await createSimBulkJob(ctx.tenantId, ctx.email, { items });
    const progressed = await processSimBulkJobChunk(ctx.tenantId, ctx.email, job.id);
    return NextResponse.json({ success: true, job: progressed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bulk update failed." },
      { status: 400 },
    );
  }
}
