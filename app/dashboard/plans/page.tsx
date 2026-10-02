import Link from "next/link";
import { PlatformPlanLifecycle } from "@/components/portal/platform-plan-lifecycle";
import { requirePortal } from "@/lib/portal/guard";
import { listPlans } from "@/lib/portal/repo";
import { listAssignedPlatformPlans, listPlatformPlans } from "@/lib/portal/platform-plans";
import { can } from "@/lib/portal/role-model";

export default async function PlansPage() {
  const ctx = await requirePortal();

  if (ctx.role === "super_admin") {
    const plans = await listPlatformPlans();
    return (
      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Plans</h1>
            <p className="mt-1 text-sm text-quiet">
              Map ATN plans upward to your suppliers (Control Center, Singapore Telecom, China Mobile, …). Bind those
              plans to resellers on{" "}
              <Link href="/dashboard/contracts" className="text-accent">
                Contract
              </Link>
              .
            </p>
          </div>
          <Link href="/dashboard/plans/new" className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-on-accent">
            Create ATN plan
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {plans.length === 0 ? <p className="text-sm text-quiet">No ATN plans yet.</p> : null}
          {plans.map((plan) => (
            <article key={plan.id} className="rounded-card border border-line bg-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/dashboard/plans/${plan.id}`} className="min-w-0 hover:text-accent">
                  <p className="text-lg font-semibold">{plan.name}</p>
                  <p className="mt-1 text-sm text-quiet">
                    {plan.supplier} · {plan.ccRatePlan} · {plan.commPlan}
                  </p>
                </Link>
                <span className={`shrink-0 text-xs ${plan.active ? "text-ok" : "text-danger"}`}>
                  {plan.active ? "Active" : "Deactivated"}
                </span>
              </div>
              <p className="mt-3 text-sm">
                {plan.assignedResellers} reseller{plan.assignedResellers === 1 ? "" : "s"} on contract · {plan.simCount}{" "}
                SIMs (bought)
              </p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <Link href={`/dashboard/plans/${plan.id}`} className="text-sm text-accent">
                  Manage / map supplier
                </Link>
                <PlatformPlanLifecycle
                  planId={plan.id}
                  name={plan.name}
                  active={plan.active}
                  simCount={plan.simCount}
                />
              </div>
            </article>
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
            Map contracted rate plans downward into retail plans (name, data per SIM, price) for your
            operators and end customers. Your signed lines are on{" "}
            <Link href="/dashboard/contracts" className="text-accent">
              Contract
            </Link>
            .
          </p>
        </div>
        {can(ctx.role, "plan.create") ? (
          <Link href="/dashboard/plans/new" className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-on-accent">
            Copy to retail
          </Link>
        ) : null}
      </div>

      {ctx.role === "reseller_admin" && assigned.length > 0 ? (
        <p className="mt-4 text-sm text-quiet">
          {assigned.length} contracted ATN line{assigned.length === 1 ? "" : "s"} available to copy.
        </p>
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
