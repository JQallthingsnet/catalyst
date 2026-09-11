import { AssignWizard } from "@/components/portal/assign-wizard";
import { requirePortal } from "@/lib/portal/guard";
import { listCustomers, listPlans, listPools, listSims } from "@/lib/portal/repo";
import Link from "next/link";

export default async function AssignPage() {
  const ctx = await requirePortal();
  const [customers, plans, pools, sims] = await Promise.all([
    listCustomers(ctx.tenantId),
    listPlans(ctx.tenantId),
    listPools(ctx.tenantId),
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
          plans={plans.map((item) => ({ id: item.id, name: item.name }))}
          pools={pools.map((item) => ({ id: item.id, name: item.name }))}
          sims={sims.map((item) => ({ iccid: item.iccid, state: item.state, planName: item.planName }))}
        />
      </div>
    </div>
  );
}
