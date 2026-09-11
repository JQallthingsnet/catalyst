import Link from "next/link";
import { PlanWizard } from "@/components/portal/plan-wizard";

export default function NewPlanPage() {
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
