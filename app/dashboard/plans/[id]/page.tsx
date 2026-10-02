import Link from "next/link";
import { AssignPlanForm } from "@/components/portal/assign-plan-form";
import { PlatformPlanLifecycle } from "@/components/portal/platform-plan-lifecycle";
import { UnassignPlanButton } from "@/components/portal/unassign-plan-button";
import { requirePrivilege } from "@/lib/portal/guard";
import { formatIccid } from "@/lib/portal/ids";
import {
  getPlatformPlan,
  listPlatformPlanResellers,
  listPlatformPlanTopSims,
} from "@/lib/portal/platform-plans";
import { excludeHomeTenant, listTenantOptions } from "@/lib/portal/tenant";
import { notFound } from "next/navigation";

export default async function PlatformPlanPage({ params }: { params: { id: string } | Promise<{ id: string }> }) {
  const ctx = await requirePrivilege("platform.plan");
  const { id } = await Promise.resolve(params);
  const plan = await getPlatformPlan(id);
  if (!plan) notFound();
  const [resellers, allTenants, topSims] = await Promise.all([
    listPlatformPlanResellers(plan.id),
    listTenantOptions(),
    listPlatformPlanTopSims(plan.id, 10),
  ]);
  const boundIds = new Set(resellers.map((item) => item.tenantId));
  const unbound = excludeHomeTenant(allTenants, ctx.homeTenantId).filter((item) => !boundIds.has(item.id));
  const buying = resellers.filter((item) => item.simCount > 0);
  const usageMb = resellers.reduce((sum, item) => sum + item.usageMb, 0);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/plans" className="text-sm text-quiet hover:text-accent">
            ← Plans
          </Link>
          <h1 className="mt-4 text-3xl font-semibold">{plan.name}</h1>
          <p className="mt-1 text-sm text-quiet">
            Supplier {plan.supplier} · Rate plan {plan.ccRatePlan} · {plan.commPlan}
          </p>
          <p className={`mt-2 text-sm ${plan.active ? "text-ok" : "text-danger"}`}>
            {plan.active ? "Active" : "Deactivated"}
          </p>
        </div>
        <PlatformPlanLifecycle planId={plan.id} name={plan.name} active={plan.active} simCount={plan.simCount} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <article className="rounded-card border border-line bg-panel p-5">
          <p className="text-sm text-quiet">Resellers bound</p>
          <p className="mt-2 text-3xl font-semibold">{resellers.length}</p>
        </article>
        <article className="rounded-card border border-line bg-panel p-5">
          <p className="text-sm text-quiet">Resellers buying (have SIMs)</p>
          <p className="mt-2 text-3xl font-semibold">{buying.length}</p>
        </article>
        <article className="rounded-card border border-line bg-panel p-5">
          <p className="text-sm text-quiet">Current volume (snapshot)</p>
          <p className="mt-2 text-3xl font-semibold">{usageMb.toLocaleString("en-AU")} MB</p>
        </article>
      </div>

      {plan.active ? (
        <article className="mt-6 rounded-card border border-line bg-panel p-5">
          <h2 className="font-semibold">Bind another reseller</h2>
          <p className="mt-1 text-sm text-quiet">Only bound resellers can see or buy this plan.</p>
          <AssignPlanForm platformPlanId={plan.id} resellers={unbound} />
        </article>
      ) : (
        <p className="mt-6 rounded-card border border-line bg-panel px-4 py-3 text-sm text-quiet">
          Reactivate to bind more resellers or sell stock.
        </p>
      )}

      <article className="mt-6 rounded-card border border-line bg-panel p-5">
        <h2 className="font-semibold">Bound resellers</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-quiet">
              <tr>
                <th className="py-2">Organisation</th>
                <th className="py-2">SIMs (bought)</th>
                <th className="py-2">With customer</th>
                <th className="py-2">Warehouse</th>
                <th className="py-2">Usage</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {resellers.map((row) => (
                <tr key={row.tenantId} className="border-t border-line">
                  <td className="py-2">{row.tenantName}</td>
                  <td className="py-2">{row.simCount}</td>
                  <td className="py-2">{row.assignedCount}</td>
                  <td className="py-2">{row.warehouseCount}</td>
                  <td className="py-2">{row.usageMb} MB</td>
                  <td className="py-2 text-right">
                    <UnassignPlanButton
                      platformPlanId={plan.id}
                      tenantId={row.tenantId}
                      tenantName={row.tenantName}
                      simCount={row.simCount}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {resellers.length === 0 ? <p className="py-4 text-sm text-quiet">No contracts yet.</p> : null}
        </div>
      </article>

      <article className="mt-6 rounded-card border border-line bg-panel p-5">
        <h2 className="font-semibold">Top SIMs by current volume</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {topSims.length === 0 ? <li className="text-quiet">No SIMs on this plan yet.</li> : null}
          {topSims.map((sim) => (
            <li key={sim.iccid} className="flex flex-wrap justify-between gap-2 rounded-xl border border-line px-3 py-2">
              <span className="font-mono">{formatIccid(sim.iccid)}</span>
              <span className="text-quiet">
                {sim.tenantName}
                {sim.customerName ? ` · ${sim.customerName}` : ""} · {sim.volumeMb} MB
              </span>
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}
