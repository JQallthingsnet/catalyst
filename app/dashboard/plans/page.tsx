import Link from "next/link";
import { PlatformPlansTable } from "@/components/portal/platform-plans-table";
import { RetailPlansTable } from "@/components/portal/retail-plans-table";
import { requirePortal } from "@/lib/portal/guard";
import { listPlans } from "@/lib/portal/repo";
import { listAssignedPlatformPlans, listPlatformPlans } from "@/lib/portal/platform-plans";
import { btnPrimary } from "@/lib/portal/button-styles";
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
              Map plans upward to a supplier (Optus today; others later). Bind those
              plans to resellers on{" "}
              <Link href="/dashboard/contracts" className="text-accent">
                Contract
              </Link>
              .
            </p>
          </div>
          <Link href="/dashboard/plans/new" className={btnPrimary}>
            Create Reseller Plan
          </Link>
        </div>
        <PlatformPlansTable
          plans={plans.map((plan) => ({
            id: plan.id,
            name: plan.name,
            supplier: plan.supplier,
            ccRatePlan: plan.ccRatePlan,
            commPlan: plan.commPlan,
            active: plan.active,
            assignedResellers: plan.assignedResellers,
            resellerNames: plan.resellerNames,
            simCount: plan.simCount,
          }))}
        />
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
            Create retail plans (name, data per SIM, price) from your contracted plans — these are what
            operators assign to each ICCID. Your signed lines are on{" "}
            <Link href="/dashboard/contracts" className="text-accent">
              Contract
            </Link>
            .
          </p>
        </div>
        {can(ctx.role, "plan.create") ? (
          <Link href="/dashboard/plans/new" className={btnPrimary}>
            Create retail plan
          </Link>
        ) : null}
      </div>

      {ctx.role === "reseller_admin" && assigned.length > 0 ? (
        <p className="mt-4 text-sm text-quiet">
          {assigned.length} contracted plan{assigned.length === 1 ? "" : "s"} available to create retail plans from.
        </p>
      ) : null}

      <RetailPlansTable
        showPlatformSource={ctx.role === "reseller_admin"}
        plans={retail.map((plan) => ({
          id: plan.id,
          name: plan.name,
          type: plan.type,
          inclusiveMb: plan.inclusiveMb,
          pricePerSim: plan.pricePerSim,
          platformPlanName: plan.platformPlanName,
          wholesalePlan: plan.wholesalePlan,
        }))}
      />
    </div>
  );
}
