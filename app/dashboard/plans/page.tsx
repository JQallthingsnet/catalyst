import Link from "next/link";
import { requirePortal } from "@/lib/portal/guard";
import { listPlans } from "@/lib/portal/repo";
import { COMM_PLANS, WHOLESALE_PLANS } from "@/lib/portal/catalogue";

export default async function PlansPage() {
  const ctx = await requirePortal();
  const plans = await listPlans(ctx.tenantId);

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Plans</h1>
          <p className="mt-1 text-sm text-quiet">Retail plans mapped to ATN-approved network plans.</p>
        </div>
        <Link href="/dashboard/plans/new" className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-canvas">
          Create plan
        </Link>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <article key={plan.id} className="rounded-card border border-line bg-panel p-5">
            <p className="text-lg font-semibold">{plan.name}</p>
            <p className="mt-1 text-sm text-quiet">{plan.type}</p>
            <p className="mt-3 text-sm">Inclusive {plan.inclusiveMb} MB / mo</p>
            <p className="text-sm text-quiet">Overage {plan.overage} · Roaming {plan.roaming}</p>
            <p className="mt-3 text-sm text-accent">
              {WHOLESALE_PLANS.find((item) => item.id === plan.wholesalePlan)?.label ?? plan.wholesalePlan} ·{" "}
              {COMM_PLANS.find((item) => item.id === plan.commPlan)?.label ?? plan.commPlan}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
