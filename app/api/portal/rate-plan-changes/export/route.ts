import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { ensurePortalSchema } from "@/lib/portal/schema";
import { exportRatePlanChangesCsv } from "@/lib/portal/rate-plan-change";

export async function GET() {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "rate_plan.change");
  if (denied) return denied;
  await ensurePortalSchema();

  const onPlatform = ctx.role === "super_admin" && ctx.tenantId === ctx.homeTenantId;
  try {
    const csv = await exportRatePlanChangesCsv({
      tenantId: onPlatform ? undefined : ctx.tenantId,
      includeOrganisation: onPlatform,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = onPlatform ? "all" : "org";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="plan-changes-${scope}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Export failed." }, { status: 400 });
  }
}
