import Link from "next/link";
import { requirePortal } from "@/lib/portal/guard";
import { listPlans } from "@/lib/portal/repo";
import { listAssignedPlatformPlans, listPlatformPlans } from "@/lib/portal/platform-plans";
import { can } from "@/lib/portal/role-model";
import { WHOLESALE_PLANS, COMM_PLANS } from "@/lib/portal/catalogue";

export default async function PlansPage() {
  const ctx = await requirePortal();

  if (ctx.role === "super_admin") {
    const plans = await listPlatformPlans();
    return (
      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Plans</h1>
            <p className="mt-1 text-sm text-quiet">ATN plans sold to resellers. Assign a contract, then sell SIMs.</p>
          </div>
          <Link href="/dashboard/plans/new" className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-canvas">
            Create ATN plan
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {plans.length === 0 ? <p className="text-sm text-quiet">No ATN plans yet.</p> : null}
          {plans.map((plan) => (
            <Link
              key={plan.id}
              href={`/dashboard/plans/${plan.id}`}
              className="rounded-card border border-line bg-panel p-5 hover:border-accent"
            >
              <p className="text-lg font-semibold">{plan.name}</p>
              <p className="mt-1 text-sm text-quiet">
                CC {WHOLESALE_PLANS.find((item) => item.id === plan.ccRatePlan)?.label ?? plan.ccRatePlan} ·{" "}
                {COMM_PLANS.find((item) => item.id === plan.commPlan)?.label ?? plan.commPlan}
              </p>
              <p className="mt-3 text-sm">
                {plan.assignedResellers} resellers contracted · {plan.simCount} SIMs (bought)
              </p>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const [assigned, retail] = await Promise.all([
    listAssignedPlatformPlans(ctx.tenantId),
    listPlans(ctx.tenantId),
  ]);

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Plans</h1>
          <p className="mt-1 text-sm text-quiet">
            Copy a contracted ATN plan into a retail plan (name, data per SIM, price) for operators to assign.
          </p>
        </div>
        {can(ctx.role, "plan.create") ? (
          <Link href="/dashboard/plans/new" className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-canvas">
            Copy to retail
          </Link>
        ) : null}
      </div>

      {ctx.role === "reseller_admin" ? (
        <article className="mt-6 rounded-card border border-line bg-panel p-5">
          <h2 className="font-semibold">ATN plans on contract</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {assigned.length === 0 ? <li className="text-quiet">None assigned yet.</li> : null}
            {assigned.map((plan) => (
              <li key={plan.id} className="rounded-xl border border-line px-3 py-2">
                {plan.name}
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {retail.length === 0 ? <p className="text-sm text-quiet">No retail plans yet.</p> : null}
        {retail.map((plan) => (
          <article key={plan.id} className="rounded-card border border-line bg-panel p-5">
            <p className="text-lg font-semibold">{plan.name}</p>
            <p className="mt-1 text-sm text-quiet">{plan.inclusiveMb} MB / SIM</p>
            <p className="text-sm text-quiet">
              {plan.pricePerSim != null ? `$${plan.pricePerSim} / SIM` : "No price"}
            </p>
            {ctx.role === "reseller_admin" && plan.platformPlanName ? (
              <p className="mt-3 text-sm text-accent">Copied from {plan.platformPlanName}</p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
