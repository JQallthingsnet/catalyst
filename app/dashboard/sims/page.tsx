import Link from "next/link";
import { redirect } from "next/navigation";
import { ChangeRatePlanButton } from "@/components/portal/change-rate-plan-button";
import { LifecycleButtons } from "@/components/portal/lifecycle-buttons";
import { requirePortal } from "@/lib/portal/guard";
import { formatIccid } from "@/lib/portal/ids";
import { listAssignedPlatformPlans } from "@/lib/portal/platform-plans";
import { listSims } from "@/lib/portal/repo";
import { btnPrimary, btnSecondary } from "@/lib/portal/button-styles";
import { can, simFieldsForRole } from "@/lib/portal/role-model";

function ccLabel(id: string | null) {
  if (!id) return "—";
  return id;
}

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
    listSims(ctx.tenantId, params.q ?? ""),
    can(ctx.role, "rate_plan.change")
      ? listAssignedPlatformPlans(ctx.tenantId)
      : Promise.resolve([]),
  ]);
  const fields = simFieldsForRole(ctx.role);
  const planOptions = contracted.map((plan) => ({
    id: plan.id,
    label: `${plan.name} — ${plan.ccRatePlan}`,
  }));
  const canChangePlan = can(ctx.role, "rate_plan.change");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">SIMs</h1>
          <p className="mt-1 text-sm text-quiet">
            {ctx.role === "reseller_operator"
              ? "Assign a retail plan and end customer. Lifecycle actions are queued for ATN (same recipients as Order SIMs)."
              : ctx.role === "reseller_admin"
                ? "Inventory. Lifecycle actions Request Activate / Suspend / Resume / Deactivate are emailed to ATN for bulk Jasper processing — including reactivate from Deactivated."
                : "Inventory and lifecycle. Control Center remains the radio source."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          {can(ctx.role, "assign") ? (
            <Link href="/dashboard/sims/assign" className={btnPrimary}>
              Assign SIMs
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="text-quiet">
            <tr>
              {fields.tenantName ? <th className="px-4 py-3">Organisation</th> : null}
              <th className="px-4 py-3">ICCID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Retail plan</th>
              {fields.platformPlan ? <th className="px-4 py-3">Plan</th> : null}
              {fields.ccRatePlan ? <th className="px-4 py-3">CC rate plan</th> : null}
              {fields.ccStatus ? <th className="px-4 py-3">CC status</th> : null}
              <th className="px-4 py-3">IMSI</th>
              <th className="px-4 py-3">MSISDN</th>
              <th className="px-4 py-3">Volume</th>
              <th className="px-4 py-3">Pool</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Lifecycle</th>
              {canChangePlan ? <th className="px-4 py-3">Rate plan</th> : null}
            </tr>
          </thead>
          <tbody>
            {sims.map((sim) => (
              <tr key={sim.id} className="border-t border-line">
                {fields.tenantName ? <td className="px-4 py-3">{sim.tenantName ?? "—"}</td> : null}
                <td className="px-4 py-3 font-mono">{formatIccid(sim.iccid)}</td>
                <td className="px-4 py-3">{sim.customerName ?? "—"}</td>
                <td className="px-4 py-3">{sim.planName ?? "—"}</td>
                {fields.platformPlan ? <td className="px-4 py-3">{sim.platformPlanName ?? "—"}</td> : null}
                {fields.ccRatePlan ? <td className="px-4 py-3">{ccLabel(sim.wholesalePlan)}</td> : null}
                {fields.ccStatus ? <td className="px-4 py-3">{sim.ccStatus ?? "—"}</td> : null}
                <td className="px-4 py-3 font-mono">{sim.imsi ?? "—"}</td>
                <td className="px-4 py-3 font-mono">{sim.msisdn ?? "—"}</td>
                <td className="px-4 py-3">
                  {sim.currentVolumeMb != null ? `${sim.currentVolumeMb} MB` : "—"}
                </td>
                <td className="px-4 py-3">{sim.poolName ?? "—"}</td>
                <td className="px-4 py-3">{sim.state}</td>
                <td className="px-4 py-3">
                  {can(ctx.role, "lifecycle") ? (
                    <LifecycleButtons
                      iccid={sim.iccid}
                      mode={ctx.role === "super_admin" ? "apply" : "request"}
                    />
                  ) : (
                    sim.state
                  )}
                </td>
                {canChangePlan ? (
                  <td className="px-4 py-3">
                    <ChangeRatePlanButton
                      iccid={sim.iccid}
                      currentPlatformPlanId={sim.platformPlanId}
                      options={planOptions}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {sims.length === 0 ? <p className="px-4 py-8 text-sm text-quiet">No SIMs match this search.</p> : null}
      </div>
    </div>
  );
}
