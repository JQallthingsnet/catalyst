import Link from "next/link";
import { PoolWizard } from "@/components/portal/pool-wizard";
import { requirePortal } from "@/lib/portal/guard";
import { listSims } from "@/lib/portal/repo";

export default async function NewPoolPage() {
  const ctx = await requirePortal();
  const sims = await listSims(ctx.tenantId);
  return (
    <div>
      <Link href="/dashboard/pools" className="text-sm text-quiet hover:text-accent">
        ← Pools
      </Link>
      <div className="mt-4">
        <PoolWizard readyIccids={sims.map((sim) => sim.iccid)} />
      </div>
    </div>
  );
}
