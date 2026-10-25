import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { exportAuditLogsCsv, normalizeAuditLogFilter } from "@/lib/portal/audit";
import { ensurePortalSchema } from "@/lib/portal/schema";

export async function GET(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "audit.view");
  if (denied) return denied;
  await ensurePortalSchema();

  const onPlatform = ctx.role === "super_admin";
  const url = new URL(request.url);
  const filter = normalizeAuditLogFilter({
    scopeTenantId: onPlatform ? undefined : ctx.tenantId,
    organisationId: onPlatform ? (url.searchParams.get("org") ?? "") : undefined,
    query: url.searchParams.get("q") ?? "",
    action: url.searchParams.get("action") ?? "",
    actorEmail: url.searchParams.get("by") ?? "",
    dateFrom: url.searchParams.get("dateFrom") ?? "",
    dateTo: url.searchParams.get("dateTo") ?? "",
  });

  try {
    const csv = await exportAuditLogsCsv({
      filter,
      includeOrganisation: onPlatform,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = onPlatform ? "all" : "org";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="logs-${scope}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Export failed." }, { status: 400 });
  }
}
