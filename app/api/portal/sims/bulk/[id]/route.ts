import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { can } from "@/lib/portal/role-model";
import { getSimBulkJob, processSimBulkJobChunk } from "@/lib/portal/sim-bulk";

function denyForBulkKind(ctx: Parameters<typeof denyUnless>[0], kind: string) {
  if (kind === "rate_plan") return denyUnless(ctx, "rate_plan.change");
  if (kind === "retail_plan") return denyUnless(ctx, "assign");
  if (kind === "Activate" || kind === "Deactivate" || kind === "mixed") {
    // Mixed jobs may include plan actions; allow anyone who can start any bulk action.
    if (
      can(ctx.role, "lifecycle") ||
      can(ctx.role, "assign") ||
      can(ctx.role, "rate_plan.change")
    ) {
      return null;
    }
    return denyUnless(ctx, "lifecycle");
  }
  return denyUnless(ctx, "lifecycle");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  if (
    !can(ctx.role, "lifecycle") &&
    !can(ctx.role, "rate_plan.change") &&
    !can(ctx.role, "assign")
  ) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await Promise.resolve(context.params);
  const job = await getSimBulkJob(ctx.tenantId, id);
  if (!job) return NextResponse.json({ error: "Bulk job not found." }, { status: 404 });
  return NextResponse.json({ job });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;

  const { id } = await Promise.resolve(context.params);
  const existing = await getSimBulkJob(ctx.tenantId, id);
  if (!existing) return NextResponse.json({ error: "Bulk job not found." }, { status: 404 });

  const denied = denyForBulkKind(ctx, existing.kind);
  if (denied) return denied;

  try {
    const job = await processSimBulkJobChunk(ctx.tenantId, ctx.email, id);
    return NextResponse.json({ success: true, job });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bulk process failed." },
      { status: 400 },
    );
  }
}
