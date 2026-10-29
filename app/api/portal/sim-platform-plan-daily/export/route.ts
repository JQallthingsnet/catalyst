import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { ensurePortalSchema } from "@/lib/portal/schema";
import { exportSimPlatformPlanDailyCsv } from "@/lib/portal/sim-platform-plan-daily";

/** CSV of daily Reseller Plan usage per ICCID (all plans used that day). */
export async function GET(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "rate_plan.change");
  if (denied) return denied;
  await ensurePortalSchema();

  const onPlatform = ctx.role === "super_admin" && ctx.tenantId === ctx.homeTenantId;
  const url = new URL(request.url);
  const org = url.searchParams.get("org")?.trim() ?? "";
  const tenantId = onPlatform ? org || undefined : ctx.tenantId;
  if (!onPlatform && !tenantId) {
    return Response.json({ error: "Organisation scope required." }, { status: 400 });
  }

  try {
    const csv = await exportSimPlatformPlanDailyCsv({
      tenantId,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      includeOrganisation: onPlatform && !tenantId,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = tenantId ? "org" : "all";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reseller-plan-daily-${scope}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Export failed." }, { status: 400 });
  }
}
