import Link from "next/link";
import { requirePrivilege } from "@/lib/portal/guard";
import { listPoolModemTopups, sydneyMonthKey } from "@/lib/portal/pool-topups";
import { btnSecondary } from "@/lib/portal/button-styles";
import { formatAuDateTime } from "@/lib/portal/time";

export default async function BillablePage({
  searchParams,
}: {
  searchParams?: { month?: string } | Promise<{ month?: string }>;
}) {
  const ctx = await requirePrivilege("pool.view");
  if (ctx.role === "super_admin") {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Billable items</h1>
        <p className="mt-2 text-sm text-quiet">
          Switch to reseller admin view for an organisation to see pool top-ups and other billable
          lines.
        </p>
      </div>
    );
  }

  const params = await Promise.resolve(searchParams ?? {});
  const monthKey = params.month?.trim() || sydneyMonthKey();
  const items = await listPoolModemTopups({ tenantId: ctx.tenantId, monthKey });
  const totalCharge = items.reduce((sum, row) => sum + row.chargeAud, 0);
  const totalMb = items.reduce((sum, row) => sum + row.allowanceMb, 0);
  const totalUnits = items.reduce((sum, row) => sum + row.simUnits, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Billable items</h1>
          <p className="mt-1 text-sm text-quiet">
            Pool top-ups for Sydney month <span className="font-mono text-ink">{monthKey}</span>.
            Capacity applies immediately for the current month only — no SIMs are shipped.
          </p>
        </div>
        <Link href="/dashboard/pools" className={btnSecondary}>
          Back to Pools
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <article className="rounded-card border border-line bg-panel p-4">
          <p className="text-xs text-quiet">SIM units</p>
          <p className="mt-1 text-2xl font-semibold">{totalUnits.toLocaleString("en-AU")}</p>
        </article>
        <article className="rounded-card border border-line bg-panel p-4">
          <p className="text-xs text-quiet">Allowance added</p>
          <p className="mt-1 text-2xl font-semibold">
            {totalMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })} MB
          </p>
        </article>
        <article className="rounded-card border border-line bg-panel p-4">
          <p className="text-xs text-quiet">Charge</p>
          <p className="mt-1 text-2xl font-semibold">
            ${totalCharge.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </article>
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="text-quiet">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Reseller Plan</th>
              <th className="px-4 py-3">SIM units</th>
              <th className="px-4 py-3">Unit price</th>
              <th className="px-4 py-3">Per-SIM MB</th>
              <th className="px-4 py-3">Allowance MB</th>
              <th className="px-4 py-3">Charge</th>
              <th className="px-4 py-3">By</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-4 py-3 font-mono text-xs">{formatAuDateTime(row.createdAt)}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.modemId}</td>
                <td className="px-4 py-3">{row.simUnits.toLocaleString("en-AU")}</td>
                <td className="px-4 py-3">
                  ${row.unitPriceAud.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3">
                  {row.perSimAllowanceMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}
                </td>
                <td className="px-4 py-3">
                  {row.allowanceMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}
                </td>
                <td className="px-4 py-3">
                  ${row.chargeAud.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-quiet">{row.createdBy}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-quiet">
                  No pool top-ups for this month yet. Buy from Pools per Reseller Plan.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
