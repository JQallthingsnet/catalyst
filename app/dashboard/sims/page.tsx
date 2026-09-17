import Link from "next/link";
import { LifecycleButtons } from "@/components/portal/lifecycle-buttons";
import { requirePortal } from "@/lib/portal/guard";
import { formatIccid } from "@/lib/portal/ids";
import { listSims } from "@/lib/portal/repo";
import { can, simFieldsForRole } from "@/lib/portal/role-model";
import { WHOLESALE_PLANS } from "@/lib/portal/catalogue";

function ccLabel(id: string | null) {
  if (!id) return "—";
  return WHOLESALE_PLANS.find((item) => item.id === id)?.label ?? id;
}

export default async function SimsPage({
  searchParams,
}: {
  searchParams?: { q?: string } | Promise<{ q?: string }>;
}) {
  const ctx = await requirePortal();
  const params = await Promise.resolve(searchParams ?? {});
  const sims = await listSims(ctx.tenantId, params.q ?? "");
  const fields = simFieldsForRole(ctx.role);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">SIMs</h1>
          <p className="mt-1 text-sm text-quiet">
            {ctx.role === "reseller_operator"
              ? "Assign a retail plan and end customer. Warehouse SIMs have no customer yet."
              : "Inventory and lifecycle. Control Center remains the radio source."}
          </p>
        </div>
        <div className="flex gap-2">
          {can(ctx.role, "wholesale.allocate") ? (
            <Link href="/dashboard/estate/allocate" className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent">
              Sell stock
            </Link>
          ) : null}
          {can(ctx.role, "assign") ? (
            <Link href="/dashboard/sims/assign" className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-canvas">
              Assign SIMs
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="text-quiet">
            <tr>
              {fields.tenantName ? <th className="px-4 py-3">Organisation</th> : null}
              <th className="px-4 py-3">ICCID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Retail plan</th>
              {fields.platformPlan ? <th className="px-4 py-3">ATN plan</th> : null}
              {fields.ccRatePlan ? <th className="px-4 py-3">CC rate plan</th> : null}
              <th className="px-4 py-3">IMSI</th>
              <th className="px-4 py-3">MSISDN</th>
              <th className="px-4 py-3">Volume</th>
              <th className="px-4 py-3">Pool</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Lifecycle</th>
            </tr>
          </thead>
          <tbody>
            {sims.map((sim) => (
              <tr key={sim.id} className="border-t border-line">
                {fields.tenantName ? <td className="px-4 py-3">{sim.tenantName ?? "—"}</td> : null}
                <td className="px-4 py-3 font-mono">{formatIccid(sim.iccid)}</td>
                <td className="px-4 py-3">{sim.customerName ?? "—"}</td>
                <td className="px-4 py-3">{sim.planName ?? "—"}</td>
                {fields.platformPlan ? <td className="px-4 py-3">{sim.platformPlanName ?? "—"}</td> : null}
                {fields.ccRatePlan ? <td className="px-4 py-3">{ccLabel(sim.wholesalePlan)}</td> : null}
                <td className="px-4 py-3 font-mono">{sim.imsi ?? "—"}</td>
                <td className="px-4 py-3 font-mono">{sim.msisdn ?? "—"}</td>
                <td className="px-4 py-3">
                  {sim.currentVolumeMb != null ? `${sim.currentVolumeMb} MB` : "—"}
                </td>
                <td className="px-4 py-3">{sim.poolName ?? "—"}</td>
                <td className="px-4 py-3">{sim.state}</td>
                <td className="px-4 py-3">
                  {can(ctx.role, "lifecycle") ? <LifecycleButtons iccid={sim.iccid} /> : sim.state}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sims.length === 0 ? <p className="px-4 py-8 text-sm text-quiet">No SIMs match this search.</p> : null}
      </div>
    </div>
  );
}
