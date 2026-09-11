import Link from "next/link";
import { LifecycleButtons } from "@/components/portal/lifecycle-buttons";
import { requirePortal } from "@/lib/portal/guard";
import { formatIccid } from "@/lib/portal/ids";
import { listSims } from "@/lib/portal/repo";
import { can } from "@/lib/portal/role-model";

export default async function SimsPage({
  searchParams,
}: {
  searchParams?: { q?: string } | Promise<{ q?: string }>;
}) {
  const ctx = await requirePortal();
  const params = await Promise.resolve(searchParams ?? {});
  const sims = await listSims(ctx.tenantId, params.q ?? "");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">SIMs</h1>
          <p className="mt-1 text-sm text-quiet">Inventory, order, and lifecycle. States match Control Center only.</p>
        </div>
        <div className="flex gap-2">
          {can(ctx.role, "order.create") ? (
            <Link href="/dashboard/sims/order" className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-canvas">
              Order SIMs
            </Link>
          ) : null}
          {can(ctx.role, "assign") ? (
            <Link href="/dashboard/sims/assign" className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent">
              Assign SIMs
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="text-quiet">
            <tr>
              <th className="px-4 py-3">ICCID</th>
              <th className="px-4 py-3">Form</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Pool</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Lifecycle</th>
            </tr>
          </thead>
          <tbody>
            {sims.map((sim) => (
              <tr key={sim.id} className="border-t border-line">
                <td className="px-4 py-3 font-mono">{formatIccid(sim.iccid)}</td>
                <td className="px-4 py-3">{sim.formFactor}</td>
                <td className="px-4 py-3">{sim.customerName ?? "—"}</td>
                <td className="px-4 py-3">{sim.planName ?? "—"}</td>
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
