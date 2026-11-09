import Link from "next/link";
import { InvoiceExportButton } from "@/components/portal/invoice-export-button";
import { btnPrimary, btnSecondary } from "@/lib/portal/button-styles";
import { requirePrivilege } from "@/lib/portal/guard";
import { formatIccid } from "@/lib/portal/ids";
import {
  buildMonthlyInvoice,
  invoiceMonthOptions,
  invoiceMonthWindow,
} from "@/lib/portal/invoice";
import { sydneyMonthKey } from "@/lib/portal/pool-topups";
import { excludeHomeTenant, listTenantOptions } from "@/lib/portal/tenant";
import { formatAuDateTime } from "@/lib/portal/time";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?:
    | { month?: string; org?: string }
    | Promise<{ month?: string; org?: string }>;
}) {
  const ctx = await requirePrivilege("pool.view");
  const params = await Promise.resolve(searchParams ?? {});
  const onPlatform = ctx.role === "super_admin";
  const monthKey = invoiceMonthWindow(params.month?.trim() || sydneyMonthKey()).monthKey;
  const monthOptions = invoiceMonthOptions();
  const orgs = onPlatform ? excludeHomeTenant(await listTenantOptions(true), ctx.homeTenantId) : [];
  const orgId = onPlatform ? params.org?.trim() || "" : ctx.tenantId;

  const invoices = onPlatform
    ? orgId
      ? [await buildMonthlyInvoice({ tenantId: orgId, monthKey })]
      : await Promise.all(
          orgs.map((org) =>
            buildMonthlyInvoice({
              tenantId: org.id,
              monthKey,
              organisationName: org.name,
            }),
          ),
        )
    : [await buildMonthlyInvoice({ tenantId: ctx.tenantId, monthKey })];

  const primary = invoices.length === 1 ? invoices[0] : null;
  const topups = invoices.flatMap((inv) => inv.topups);
  const planSummaries = invoices.flatMap((inv) => inv.planSummaries);
  const totalTopupCharge = topups.reduce((sum, row) => sum + row.chargeAud, 0);
  const totalIccidCharge = invoices.reduce(
    (sum, inv) => sum + inv.iccidRows.reduce((s, row) => s + row.chargeAud, 0),
    0,
  );
  const iccidCount = invoices.reduce((sum, inv) => sum + inv.iccidRows.length, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Invoices</h1>
          <p className="mt-1 text-sm text-quiet">
            Monthly summary for Sydney billing month{" "}
            <span className="font-mono text-ink">{monthKey}</span>
            {primary ? (
              <>
                {" "}
                (as of <span className="font-mono text-ink">{primary.asOfDay}</span>, after the
                11:59&nbsp;pm Sydney refresh). Charge is contract unit price per ICCID; pool top-ups
                are listed separately.
              </>
            ) : (
              <> — all reseller organisations. Pick one org for a focused view.</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InvoiceExportButton monthKey={monthKey} organisationId={onPlatform ? orgId : ""} />
          <Link href="/dashboard/pools" className={btnSecondary}>
            Pools
          </Link>
        </div>
      </div>

      <form
        action="/dashboard/invoices"
        className="mt-6 flex flex-wrap items-end gap-3 rounded-card border border-line bg-panel p-4"
      >
        <label className="block text-xs font-medium text-quiet">
          Month
          <select
            name="month"
            defaultValue={monthKey}
            className="mt-1 h-10 rounded-full border border-line bg-canvas px-3 text-sm text-ink"
          >
            {monthOptions.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
        {onPlatform ? (
          <label className="block text-xs font-medium text-quiet">
            Organisation
            <select
              name="org"
              defaultValue={orgId}
              className="mt-1 h-10 min-w-48 rounded-full border border-line bg-canvas px-3 text-sm text-ink"
            >
              <option value="">All resellers</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="submit" className={btnPrimary}>
          Apply
        </button>
      </form>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <article className="rounded-card border border-line bg-panel p-4">
          <p className="text-xs text-quiet">ICCIDs</p>
          <p className="mt-1 text-2xl font-semibold">{iccidCount.toLocaleString("en-AU")}</p>
        </article>
        <article className="rounded-card border border-line bg-panel p-4">
          <p className="text-xs text-quiet">SIM charges</p>
          <p className="mt-1 text-2xl font-semibold">
            $
            {totalIccidCharge.toLocaleString("en-AU", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </article>
        <article className="rounded-card border border-line bg-panel p-4">
          <p className="text-xs text-quiet">Pool top-ups</p>
          <p className="mt-1 text-2xl font-semibold">
            $
            {totalTopupCharge.toLocaleString("en-AU", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </article>
      </div>

      <details className="mt-6 rounded-card border border-line bg-panel px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          What these tables measure
        </summary>
        <div className="mt-3 space-y-2 text-sm text-quiet">
          <p>
            Same structure as the Excel export (Column guide · ICCID charges · Plan pools ·
            Top-ups). Sydney billing month; figures as of the cycle day after the 11:59&nbsp;pm
            refresh.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="text-ink">ICCID charges</span> — one row per SIM; Charge is contract
              unit price for the billed Reseller Plan (highest unit price if the SIM changed plans).
            </li>
            <li>
              <span className="text-ink">Plan pools</span> — one row per Reseller Plan; shared CTD,
              allowance (incl. top-ups), utilisation, excess, and top-up totals.
            </li>
            <li>
              <span className="text-ink">Pool top-ups</span> — each purchase in the month (SIM units ×
              unit price / per-SIM MB).
            </li>
          </ul>
        </div>
      </details>

      <section className="mt-8 space-y-3">
        <div>
          <h2 className="text-lg font-semibold">ICCID charges</h2>
          <p className="mt-1 text-sm text-quiet">
            Per-SIM monthly charge. Reseller Plan actual is the highest unit-price plan billed on
            that ICCID in the month.
          </p>
        </div>
        <div className="overflow-x-auto rounded-card border border-line bg-panel">
          <table className="w-full min-w-160 text-left text-sm">
            <thead className="text-quiet">
              <tr>
                {onPlatform ? <th className="px-4 py-3">Organisation</th> : null}
                <th className="px-4 py-3">ICCID</th>
                <th className="px-4 py-3">Reseller Plan actual</th>
                <th className="px-4 py-3">Charge</th>
              </tr>
            </thead>
            <tbody>
              {invoices.flatMap((inv) =>
                inv.iccidRows.map((row) => (
                  <tr key={`${row.tenantId}:${row.iccid}`} className="border-t border-line">
                    {onPlatform ? (
                      <td className="px-4 py-3 text-quiet">{row.organisationName}</td>
                    ) : null}
                    <td className="px-4 py-3 font-mono text-xs">{formatIccid(row.iccid)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.resellerPlan}</td>
                    <td className="px-4 py-3">
                      $
                      {row.chargeAud.toLocaleString("en-AU", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                )),
              )}
              {iccidCount === 0 ? (
                <tr>
                  <td colSpan={onPlatform ? 4 : 3} className="px-4 py-10 text-quiet">
                    No ICCIDs with Reseller Plans for this month yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Plan pools</h2>
          <p className="mt-1 text-sm text-quiet">
            Shared pool KPIs per Reseller Plan — CTD vs allowance, excess, and month top-up totals.
            Allowance includes current-month pool top-ups.
          </p>
        </div>
        <div className="overflow-x-auto rounded-card border border-line bg-panel">
          <table className="w-full min-w-260 text-left text-sm">
            <thead className="text-quiet">
              <tr>
                {onPlatform ? <th className="px-4 py-3">Organisation</th> : null}
                <th className="px-4 py-3">Reseller Plan</th>
                <th className="px-4 py-3">SIMs</th>
                <th className="px-4 py-3">CTD MB</th>
                <th className="px-4 py-3">CTD SMS</th>
                <th className="px-4 py-3">CTD voice</th>
                <th className="px-4 py-3">Allowance MB</th>
                <th className="px-4 py-3">Util %</th>
                <th className="px-4 py-3">Excess data</th>
                <th className="px-4 py-3">Excess SMS</th>
                <th className="px-4 py-3">Excess voice</th>
                <th className="px-4 py-3">Top-ups</th>
                <th className="px-4 py-3">Unit price</th>
              </tr>
            </thead>
            <tbody>
              {planSummaries.map((row) => (
                <tr
                  key={`${row.tenantId}:${row.resellerPlan}`}
                  className="border-t border-line"
                >
                  {onPlatform ? (
                    <td className="px-4 py-3 text-quiet">{row.organisationName}</td>
                  ) : null}
                  <td className="px-4 py-3 font-mono text-xs">{row.resellerPlan}</td>
                  <td className="px-4 py-3">{row.simCount.toLocaleString("en-AU")}</td>
                  <td className="px-4 py-3">
                    {row.ctdUsageMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}
                  </td>
                  <td className="px-4 py-3">
                    {row.ctdSms.toLocaleString("en-AU", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-3">
                    {row.ctdVoiceMin.toLocaleString("en-AU", { maximumFractionDigits: 1 })}
                  </td>
                  <td className="px-4 py-3">
                    {row.allowanceMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}
                  </td>
                  <td className="px-4 py-3">{row.poolUtilisationPct}%</td>
                  <td className="px-4 py-3">
                    {row.excessDataMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}
                  </td>
                  <td className="px-4 py-3">
                    {row.excessSms.toLocaleString("en-AU", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-3">
                    {row.excessVoiceMin.toLocaleString("en-AU", { maximumFractionDigits: 1 })}
                  </td>
                  <td className="px-4 py-3">
                    {row.topupCount.toLocaleString("en-AU")}
                    {row.topupSimUnits > 0
                      ? ` · ${row.topupSimUnits.toLocaleString("en-AU")} units`
                      : ""}
                  </td>
                  <td className="px-4 py-3">
                    $
                    {row.unitPriceAud.toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ))}
              {planSummaries.length === 0 ? (
                <tr>
                  <td colSpan={onPlatform ? 13 : 12} className="px-4 py-10 text-quiet">
                    No Reseller Plan pools for this month yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Pool top-ups</h2>
          <p className="mt-1 text-sm text-quiet">
            Each purchase this month. Charge = unit price × SIM units; allowance MB = per-SIM MB ×
            SIM units.
          </p>
        </div>
        <div className="overflow-x-auto rounded-card border border-line bg-panel">
          <table className="w-full min-w-180 text-left text-sm">
            <thead className="text-quiet">
              <tr>
                <th className="px-4 py-3">When</th>
                {onPlatform ? <th className="px-4 py-3">Organisation</th> : null}
                <th className="px-4 py-3">Reseller Plan</th>
                <th className="px-4 py-3">SIM units</th>
                <th className="px-4 py-3">Unit price</th>
                <th className="px-4 py-3">Allowance MB</th>
                <th className="px-4 py-3">Charge</th>
                <th className="px-4 py-3">By</th>
              </tr>
            </thead>
            <tbody>
              {invoices.flatMap((inv) =>
                inv.topups.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-4 py-3 font-mono text-xs">{formatAuDateTime(row.createdAt)}</td>
                    {onPlatform ? (
                      <td className="px-4 py-3 text-quiet">{inv.organisationName}</td>
                    ) : null}
                    <td className="px-4 py-3 font-mono text-xs">{row.modemId}</td>
                    <td className="px-4 py-3">{row.simUnits.toLocaleString("en-AU")}</td>
                    <td className="px-4 py-3">
                      $
                      {row.unitPriceAud.toLocaleString("en-AU", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {row.allowanceMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}
                    </td>
                    <td className="px-4 py-3">
                      $
                      {row.chargeAud.toLocaleString("en-AU", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3 text-quiet">{row.createdBy}</td>
                  </tr>
                )),
              )}
              {topups.length === 0 ? (
                <tr>
                  <td colSpan={onPlatform ? 8 : 7} className="px-4 py-10 text-quiet">
                    No pool top-ups for this month.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
