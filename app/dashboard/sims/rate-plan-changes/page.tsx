import Link from "next/link";
import { requirePrivilege } from "@/lib/portal/guard";
import { formatIccid } from "@/lib/portal/ids";
import { listRatePlanChanges } from "@/lib/portal/rate-plan-change";
import { formatAuDateTime } from "@/lib/portal/time";

export default async function RatePlanChangesPage() {
  const ctx = await requirePrivilege("rate_plan.change");
  const onPlatform = ctx.role === "super_admin" && ctx.tenantId === ctx.homeTenantId;
  const changes = await listRatePlanChanges({
    tenantId: onPlatform ? undefined : ctx.tenantId,
    limit: 200,
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Plan changes</h1>
          <p className="mt-1 text-sm text-quiet">
            {onPlatform
              ? "Rate-plan changes across reseller ICCIDs. Jasper push is not wired yet."
              : "Rate-plan changes for your organisation’s ICCIDs."}
          </p>
        </div>
        <Link href="/dashboard/sims" className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent">
          Back to SIMs
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="text-quiet">
            <tr>
              <th className="px-4 py-3">When</th>
              {onPlatform ? <th className="px-4 py-3">Organisation</th> : null}
              <th className="px-4 py-3">ICCID</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">To</th>
              <th className="px-4 py-3">State at change</th>
              <th className="px-4 py-3">Current</th>
              <th className="px-4 py-3">TCode</th>
              <th className="px-4 py-3">By</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-4 py-3 whitespace-nowrap">{formatAuDateTime(row.createdAt)}</td>
                {onPlatform ? <td className="px-4 py-3">{row.tenantName}</td> : null}
                <td className="px-4 py-3 font-mono">{formatIccid(row.iccid)}</td>
                <td className="px-4 py-3">{row.fromRatePlan ?? "—"}</td>
                <td className="px-4 py-3">{row.toRatePlan}</td>
                <td className="px-4 py-3">{row.simState}</td>
                <td className="px-4 py-3">{row.simStatus ?? "—"}</td>
                <td className="px-4 py-3">
                  {row.tcodeMismatch ? (
                    <span className="text-danger">Mismatch — notify billing</span>
                  ) : (
                    <span className="text-quiet">OK</span>
                  )}
                </td>
                <td className="px-4 py-3 text-quiet">{row.actorEmail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {changes.length === 0 ? (
          <p className="px-4 py-8 text-sm text-quiet">No rate-plan changes recorded yet.</p>
        ) : null}
      </div>
    </div>
  );
}
