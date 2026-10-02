import Link from "next/link";
import { BindPlanToResellerForm } from "@/components/portal/bind-plan-to-reseller-form";
import { SetDefaultPlanButton } from "@/components/portal/set-default-plan-button";
import { UnassignPlanButton } from "@/components/portal/unassign-plan-button";
import type { ContractBookEntry, PlatformPlan } from "@/lib/portal/platform-plans";
import { Fragment } from "react";

export function ContractsAdminView({
  book,
  plans,
}: {
  book: ContractBookEntry[];
  plans: PlatformPlan[];
}) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold">Contract</h1>
          <p className="mt-1 text-sm text-quiet">
            Agreements ATN has signed with each reseller. Bind rate plans here before you sell stock — only bound
            resellers can see and use them. Map each line to a supplier on{" "}
            <Link href="/dashboard/plans" className="text-accent">
              Plans
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/admin"
            className="rounded-card border border-line px-4 py-2 text-sm text-ink hover:border-accent"
          >
            Add reseller
          </Link>
          <Link
            href="/dashboard/plans/new?from=contract"
            className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
          >
            Add rate plan
          </Link>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-190 text-left text-sm">
          <thead className="border-b border-line text-quiet">
            <tr>
              <th className="px-4 py-3 font-medium">Reseller</th>
              <th className="px-4 py-3 font-medium">Rate plan</th>
              <th className="px-4 py-3 font-medium">Remarks</th>
              <th className="px-4 py-3 font-medium">Default</th>
              <th className="px-4 py-3 font-medium">SIMs</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {book.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-quiet">
                  No reseller organisations yet. Create one from{" "}
                  <Link href="/dashboard/admin" className="text-accent">
                    Admin
                  </Link>
                  , then add contracted rate plans.
                </td>
              </tr>
            ) : null}
            {book.map((entry) => (
              <ContractResellerBlock
                key={entry.tenantId}
                entry={entry}
                unbound={plans
                  .filter((plan) => !entry.plans.some((bound) => bound.platformPlanId === plan.id))
                  .map((plan) => ({
                    id: plan.id,
                    ratePlanNew: plan.ccRatePlan,
                    remarks: plan.name,
                  }))}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContractResellerBlock({
  entry,
  unbound,
}: {
  entry: ContractBookEntry;
  unbound: { id: string; ratePlanNew: string; remarks: string }[];
}) {
  const bodyRows = Math.max(entry.plans.length, 1);

  return (
    <Fragment>
      {entry.plans.length === 0 ? (
        <tr className="border-t border-line align-top">
          <td className="px-4 py-3" rowSpan={2}>
            <p className={entry.tenantActive ? "font-medium text-ink" : "font-medium text-quiet"}>{entry.tenantName}</p>
            {!entry.tenantActive ? <p className="text-xs text-danger">Deactivated</p> : null}
            <p className="mt-1 text-xs text-danger">No rate plans — cannot sell SIMs yet.</p>
          </td>
          <td className="px-4 py-3 text-quiet" colSpan={4}>
            —
          </td>
          <td className="px-4 py-3" />
        </tr>
      ) : (
        entry.plans.map((plan, index) => (
          <tr key={plan.platformPlanId} className="border-t border-line align-top">
            {index === 0 ? (
              <td className="px-4 py-3" rowSpan={bodyRows + 1}>
                <p className={entry.tenantActive ? "font-medium text-ink" : "font-medium text-quiet"}>
                  {entry.tenantName}
                </p>
                {!entry.tenantActive ? <p className="text-xs text-danger">Deactivated</p> : null}
              </td>
            ) : null}
            <td className="px-4 py-3">
              <Link href={`/dashboard/plans/${plan.platformPlanId}`} className="font-mono text-accent">
                {plan.ratePlanNew}
              </Link>
              {!plan.active ? <span className="ml-2 text-xs text-danger">Deactivated</span> : null}
            </td>
            <td className="px-4 py-3 text-quiet">{plan.remarks}</td>
            <td className="px-4 py-3">
              <SetDefaultPlanButton
                tenantId={entry.tenantId}
                platformPlanId={plan.platformPlanId}
                isDefault={plan.isDefault}
              />
            </td>
            <td className="px-4 py-3">{plan.simCount}</td>
            <td className="px-4 py-3 text-right">
              <UnassignPlanButton
                platformPlanId={plan.platformPlanId}
                tenantId={entry.tenantId}
                tenantName={entry.tenantName}
                simCount={plan.simCount}
              />
            </td>
          </tr>
        ))
      )}
      <tr className="border-t border-line/40 bg-canvas/30">
        <td className="px-4 py-3" colSpan={5}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-quiet">Possibility to add more</span>
            {entry.tenantActive ? <BindPlanToResellerForm tenantId={entry.tenantId} plans={unbound} /> : null}
            <Link href="/dashboard/plans/new?from=contract" className="text-xs text-accent">
              Create new rate plan
            </Link>
          </div>
        </td>
      </tr>
    </Fragment>
  );
}
