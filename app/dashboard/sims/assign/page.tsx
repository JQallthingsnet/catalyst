import { AssignWizard } from "@/components/portal/assign-wizard";
import { requirePrivilege } from "@/lib/portal/guard";
import { listCustomers, listPlans, listSims } from "@/lib/portal/repo";
import Link from "next/link";

export default async function AssignPage() {
  const ctx = await requirePrivilege("assign");
  const [customers, plans, sims] = await Promise.all([
    listCustomers(ctx.tenantId),
    listPlans(ctx.tenantId),
    listSims(ctx.tenantId),
  ]);

  return (
    <div>
      <Link href="/dashboard/sims" className="text-sm text-quiet hover:text-accent">
        ← Inventory
      </Link>
      <div className="mt-4">
        <AssignWizard
          customers={customers.map((item) => ({ id: item.id, name: item.name }))}
          plans={plans
            .filter((item) => item.platformPlanId)
            .map((item) => ({ id: item.id, name: item.name }))}
          sims={sims.map((item) => ({
            iccid: item.iccid,
            state: item.state,
            planName: item.planName,
            customerName: item.customerName,
          }))}
        />
      </div>
    </div>
  );
}
