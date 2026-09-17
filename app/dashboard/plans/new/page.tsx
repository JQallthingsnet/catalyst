import Link from "next/link";
import { PlatformPlanWizard } from "@/components/portal/platform-plan-wizard";
import { RetailPlanWizard } from "@/components/portal/retail-plan-wizard";
import { requirePortal } from "@/lib/portal/guard";
import { listAssignedPlatformPlans } from "@/lib/portal/platform-plans";
import { can } from "@/lib/portal/role-model";
import { redirect } from "next/navigation";

export default async function NewPlanPage() {
  const ctx = await requirePortal();
  if (ctx.role === "super_admin") {
    if (!can(ctx.role, "platform.plan")) redirect("/dashboard");
    return (
      <div>
        <Link href="/dashboard/plans" className="text-sm text-quiet hover:text-accent">
          ← Plans
        </Link>
        <div className="mt-4">
          <PlatformPlanWizard />
        </div>
      </div>
    );
  }
  if (!can(ctx.role, "plan.create")) redirect("/dashboard");
  const assigned = await listAssignedPlatformPlans(ctx.tenantId);
  return (
    <div>
      <Link href="/dashboard/plans" className="text-sm text-quiet hover:text-accent">
        ← Plans
      </Link>
      <div className="mt-4">
        <RetailPlanWizard platformPlans={assigned.map((item) => ({ id: item.id, name: item.name }))} />
      </div>
    </div>
  );
}
