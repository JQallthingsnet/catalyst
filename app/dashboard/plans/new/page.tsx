import Link from "next/link";
import { PlanWizard } from "@/components/portal/plan-wizard";
import { requirePrivilege } from "@/lib/portal/guard";

export default async function NewPlanPage() {
  await requirePrivilege("plan.create");
  return (
    <div>
      <Link href="/dashboard/plans" className="text-sm text-quiet hover:text-accent">
        ← Plans
      </Link>
      <div className="mt-4">
        <PlanWizard />
      </div>
    </div>
  );
}
