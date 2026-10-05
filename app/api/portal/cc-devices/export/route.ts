import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { ensurePortalSchema } from "@/lib/portal/schema";
import { exportCcDevicesCsv, normalizeCcFilter } from "@/lib/cc/devices";

export async function GET(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.estate");
  if (denied) return denied;
  await ensurePortalSchema();

  const url = new URL(request.url);
  const inSessionRaw = url.searchParams.get("inSession");
  const dateFieldRaw = url.searchParams.get("dateField");
  const filter = normalizeCcFilter({
    query: url.searchParams.get("q") ?? "",
    supplier: url.searchParams.get("supplier") ?? "",
    status: url.searchParams.get("status") ?? "",
    ratePlan: url.searchParams.get("ratePlan") ?? "",
    communicationPlan: url.searchParams.get("commPlan") ?? "",
    customer: url.searchParams.get("customer") ?? "",
    accountId: url.searchParams.get("accountId") ?? "",
    modemId: url.searchParams.get("modemId") ?? "",
    globalSimType: url.searchParams.get("globalSim") ?? "",
    simProfileId: url.searchParams.get("simProfile") ?? "",
    inSession: inSessionRaw === "yes" || inSessionRaw === "no" ? inSessionRaw : "",
    dateField:
      dateFieldRaw === "added" || dateFieldRaw === "activated" || dateFieldRaw === "updated"
        ? dateFieldRaw
        : "",
    dateFrom: url.searchParams.get("dateFrom") ?? "",
    dateTo: url.searchParams.get("dateTo") ?? "",
  });

  try {
    const csv = await exportCcDevicesCsv(filter);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cc-snapshot-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Export failed." }, { status: 400 });
  }
}
