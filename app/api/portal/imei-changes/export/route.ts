import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { ensurePortalSchema } from "@/lib/portal/schema";
import { exportImeiChangesCsv, normalizeImeiChangeFilter } from "@/lib/portal/imei-change";

export async function GET(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "audit.view");
  if (denied) return denied;
  await ensurePortalSchema();

  const onPlatform = ctx.role === "super_admin" && ctx.tenantId === ctx.homeTenantId;
  const url = new URL(request.url);
  const filter = normalizeImeiChangeFilter({
    scopeTenantId: onPlatform ? undefined : ctx.tenantId,
    organisationId: onPlatform ? (url.searchParams.get("org") ?? "") : undefined,
    query: url.searchParams.get("q") ?? "",
    fromImei: url.searchParams.get("fromImei") ?? "",
    toImei: url.searchParams.get("toImei") ?? "",
    dateFrom: url.searchParams.get("dateFrom") ?? "",
    dateTo: url.searchParams.get("dateTo") ?? "",
  });

  try {
    const csv = await exportImeiChangesCsv({
      filter,
      includeOrganisation: onPlatform,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = onPlatform ? "all" : "org";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="imei-changes-${scope}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Export failed." }, { status: 400 });
  }
}
