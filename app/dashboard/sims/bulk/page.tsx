import Link from "next/link";
import { BulkUpdateWizard } from "@/components/portal/bulk-update-wizard";
import { requirePrivilege } from "@/lib/portal/guard";
import { listAssignedPlatformPlans } from "@/lib/portal/platform-plans";
import { listSims } from "@/lib/portal/repo";
import { can } from "@/lib/portal/role-model";

export default async function SimsBulkPage() {
  const ctx = await requirePrivilege("lifecycle");
  const canChangePlan = can(ctx.role, "rate_plan.change");
  const [sims, contracted] = await Promise.all([
    listSims(ctx.tenantId, "", 5_000),
    canChangePlan ? listAssignedPlatformPlans(ctx.tenantId) : Promise.resolve([]),
  ]);

  return (
    <div>
      <Link href="/dashboard/sims" className="text-sm text-quiet hover:text-accent">
        ← Inventory
      </Link>
      <div className="mt-4">
        <BulkUpdateWizard
          canChangePlan={canChangePlan}
          platformPlans={contracted
            .filter((plan) => plan.active)
            .map((plan) => ({ id: plan.id, name: plan.name }))}
          sims={sims.map((sim) => ({
            iccid: sim.iccid,
            state: sim.state,
            planName: sim.planName,
            platformPlanName: sim.platformPlanName,
            customerName: sim.customerName,
          }))}
        />
      </div>
    </div>
  );
}
