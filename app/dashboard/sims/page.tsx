import Link from "next/link";
import { redirect } from "next/navigation";
import { SimsInventoryPanel } from "@/components/portal/sims-inventory-panel";
import { requirePortal } from "@/lib/portal/guard";
import { listAssignedPlatformPlans } from "@/lib/portal/platform-plans";
import { listSims } from "@/lib/portal/repo";
import { btnSecondary } from "@/lib/portal/button-styles";
import { can, simFieldsForRole } from "@/lib/portal/role-model";

export default async function SimsPage({
  searchParams,
}: {
  searchParams?: { q?: string } | Promise<{ q?: string }>;
}) {
  const ctx = await requirePortal();
  const params = await Promise.resolve(searchParams ?? {});
  // Super admin commercial inventory is Estate / CC snapshot — not a third empty list.
  if (ctx.role === "super_admin") {
    const q = params.q?.trim();
    redirect(q ? `/dashboard/estate?q=${encodeURIComponent(q)}` : "/dashboard/estate");
  }
  const [sims, contracted] = await Promise.all([
    listSims(ctx.tenantId, params.q ?? "", 5_000),
    can(ctx.role, "rate_plan.change")
      ? listAssignedPlatformPlans(ctx.tenantId)
      : Promise.resolve([]),
  ]);
  const fields = simFieldsForRole(ctx.role);
  const planOptions = contracted
    .filter((plan) => plan.active)
    .map((plan) => ({
      id: plan.id,
      label: plan.name,
    }));
  const canChangePlan = can(ctx.role, "rate_plan.change");
  const canLifecycle = can(ctx.role, "lifecycle");
  const canAssign = can(ctx.role, "assign");

  const headerLinks = (
    <>
      {canChangePlan ? (
        <Link href="/dashboard/sims/rate-plan-changes" className={btnSecondary}>
          Plan changes
        </Link>
      ) : null}
      {can(ctx.role, "wholesale.allocate") ? (
        <Link href="/dashboard/estate/allocate" className={btnSecondary}>
          Sell stock
        </Link>
      ) : null}
      {can(ctx.role, "platform.estate") ? (
        <Link href="/dashboard/estate/cc" className={btnSecondary}>
          CC snapshot
        </Link>
      ) : null}
    </>
  );

  return (
    <SimsInventoryPanel
      sims={sims.map((sim) => ({
        id: sim.id,
        iccid: sim.iccid,
        tenantName: sim.tenantName,
        customerName: sim.customerName,
        planName: sim.planName,
        platformPlanId: sim.platformPlanId,
        platformPlanName: sim.platformPlanName,
        wholesalePlan: sim.wholesalePlan,
        ccStatus: sim.ccStatus,
        imsi: sim.imsi,
        msisdn: sim.msisdn,
        currentVolumeMb: sim.currentVolumeMb,
        poolName: sim.poolName,
        state: sim.state,
      }))}
      fields={fields}
      planOptions={planOptions}
      canLifecycle={canLifecycle}
      canChangePlan={canChangePlan}
      canAssign={canAssign}
      headerLinks={headerLinks}
    />
  );
}
