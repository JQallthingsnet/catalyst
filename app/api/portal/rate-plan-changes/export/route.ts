import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { ensurePortalSchema } from "@/lib/portal/schema";
import {
  exportRatePlanChangesCsv,
  normalizeRatePlanChangeFilter,
} from "@/lib/portal/rate-plan-change";

export async function GET(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "rate_plan.change");
  if (denied) return denied;
  await ensurePortalSchema();

  const onPlatform = ctx.role === "super_admin" && ctx.tenantId === ctx.homeTenantId;
  const url = new URL(request.url);
  const supplier = url.searchParams.get("supplierCode");
  const filter = normalizeRatePlanChangeFilter({
    scopeTenantId: onPlatform ? undefined : ctx.tenantId,
    organisationId: onPlatform ? (url.searchParams.get("org") ?? "") : undefined,
    query: url.searchParams.get("q") ?? "",
    fromRatePlan: url.searchParams.get("fromPlan") ?? "",
    toRatePlan: url.searchParams.get("toPlan") ?? "",
    simState: url.searchParams.get("state") ?? "",
    currentState: url.searchParams.get("current") ?? "",
    supplierCode: supplier === "ok" || supplier === "mismatch" ? supplier : "",
    actorEmail: url.searchParams.get("by") ?? "",
    dateFrom: url.searchParams.get("dateFrom") ?? "",
    dateTo: url.searchParams.get("dateTo") ?? "",
  });

  try {
    const csv = await exportRatePlanChangesCsv({
      filter,
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
