import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import {
  buildMonthlyInvoice,
  exportInvoicesXlsx,
  invoiceMonthWindow,
} from "@/lib/portal/invoice";
import { excludeHomeTenant, listTenantOptions } from "@/lib/portal/tenant";

export async function GET(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "pool.view");
  if (denied) return denied;

  const url = new URL(request.url);
  const monthKey = invoiceMonthWindow(url.searchParams.get("month") ?? "").monthKey;
  const orgParam = url.searchParams.get("org")?.trim() ?? "";

  try {
    const invoices = [];
    if (ctx.role === "super_admin") {
      if (orgParam) {
        invoices.push(await buildMonthlyInvoice({ tenantId: orgParam, monthKey }));
      } else {
        const tenants = excludeHomeTenant(await listTenantOptions(true), ctx.homeTenantId);
        for (const tenant of tenants) {
          invoices.push(
            await buildMonthlyInvoice({
              tenantId: tenant.id,
              monthKey,
              organisationName: tenant.name,
            }),
          );
        }
      }
    } else {
      invoices.push(await buildMonthlyInvoice({ tenantId: ctx.tenantId, monthKey }));
    }

    const body = exportInvoicesXlsx(invoices);
    // Copy into a plain ArrayBuffer-backed view for Response/Blob typing on Workers.
    const payload = Uint8Array.from(body);
    const scope = ctx.role === "super_admin" && !orgParam ? "all" : invoices[0]?.organisationName ?? "invoice";
    const safe = String(scope)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const filename = `catalyst-invoice-${monthKey}-${safe || "export"}.xlsx`;
    return new Response(payload, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not export invoice." },
      { status: 400 },
    );
  }
}
