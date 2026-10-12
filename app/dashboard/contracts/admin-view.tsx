import Link from "next/link";
import { BindPlanToResellerForm } from "@/components/portal/bind-plan-to-reseller-form";
import { ContractCataloguePicker } from "@/components/portal/contract-catalogue-picker";
import { ContractRules } from "@/components/portal/contract-rules";
import { SetDefaultPlanButton } from "@/components/portal/set-default-plan-button";
import { UnassignPlanButton } from "@/components/portal/unassign-plan-button";
import type { ContractBookEntry, PlatformPlan } from "@/lib/portal/platform-plans";
import type { SimSku } from "@/lib/portal/skus";

export function ContractsAdminView({
  book,
  plans,
  catalogue,
}: {
  book: ContractBookEntry[];
  plans: PlatformPlan[];
  catalogue: SimSku[];
}) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold">Contract</h1>
          <p className="mt-1 text-sm text-quiet">
            Per reseller: bind rate plans and tick catalogue SKUs they may order. A new rate plan needs catalogue
            products when none are bound yet. Map rate plans to a supplier on{" "}
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
            href="/dashboard/catalogue"
            className="rounded-card border border-line px-4 py-2 text-sm text-ink hover:border-accent"
          >
            Catalogue
          </Link>
          <Link
            href="/dashboard/plans/new?from=contract"
            className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
          >
            Create Rate Plan
          </Link>
        </div>
      </div>

      <ContractRules variant="super_admin" />

      {book.length === 0 ? (
        <p className="mt-6 text-sm text-quiet">
          No reseller organisations yet. Create one from{" "}
          <Link href="/dashboard/admin" className="text-accent">
            Admin
          </Link>
          .
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {book.map((entry) => (
            <ContractResellerCard
              key={entry.tenantId}
              entry={entry}
              unbound={plans
                .filter((plan) => !entry.plans.some((bound) => bound.platformPlanId === plan.id))
                .map((plan) => ({
                  id: plan.id,
                  ratePlanNew: plan.ccRatePlan,
                  remarks: plan.name,
                }))}
              catalogue={catalogue}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ContractResellerCard({
  entry,
  unbound,
  catalogue,
}: {
  entry: ContractBookEntry;
  unbound: { id: string; ratePlanNew: string; remarks: string }[];
  catalogue: SimSku[];
}) {
  const hasCatalogue = entry.skus.length > 0;
  const catalogueOptions = catalogue.map((sku) => ({
    id: sku.id,
    name: sku.name,
    formFactor: sku.formFactor,
    active: sku.active,
  }));
  const boundIds = entry.skus.map((sku) => sku.skuId);

  return (
    <article className="rounded-card border border-line bg-panel p-5">
      {/* Desktop: org + catalogue side by side. Mobile: stack org → catalogue → rate plans. */}
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
        <div className="min-w-0 shrink-0 md:w-56 lg:w-64">
          <h2 className={`text-lg font-semibold ${entry.tenantActive ? "text-ink" : "text-quiet"}`}>
            {entry.tenantName}
          </h2>
          {!entry.tenantActive ? <p className="mt-1 text-xs text-danger">Deactivated</p> : null}
          {entry.plans.length === 0 && hasCatalogue ? (
            <p className="mt-1 text-xs text-quiet">
              Catalogue ready — add a rate plan below.
            </p>
          ) : null}
          {entry.plans.length === 0 && !hasCatalogue ? (
            <p className="mt-1 text-xs text-danger">
              Tick catalogue SKUs, then bind a rate plan.
            </p>
          ) : null}
          {entry.plans.length > 0 && !hasCatalogue ? (
            <p className="mt-1 text-xs text-danger">Rate plans need catalogue SKUs.</p>
          ) : null}
        </div>

        <section className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-ink">Catalogue (Order SIMs)</h3>
            {entry.tenantActive ? (
              <Link href="/dashboard/catalogue" className="text-xs text-accent">
                Manage catalogue
              </Link>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-quiet">Tick to bind. Keep at least one while rate plans remain.</p>
          {entry.tenantActive ? (
            <div className="mt-3">
              <ContractCataloguePicker
                tenantId={entry.tenantId}
                options={catalogueOptions}
                boundIds={boundIds}
                hasRatePlans={entry.plans.length > 0}
              />
            </div>
          ) : (
            <p className="mt-2 text-sm text-quiet">
              {boundIds.length === 0
                ? "None bound."
                : `${boundIds.length} catalogue SKU${boundIds.length === 1 ? "" : "s"} bound.`}
            </p>
          )}
        </section>
      </div>

      <section className="mt-6 border-t border-line pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-ink">Rate plans</h3>
          {entry.tenantActive ? (
            <Link href="/dashboard/plans/new?from=contract" className="text-xs text-accent">
              Create Rate Plan
            </Link>
          ) : null}
        </div>
        {entry.plans.length === 0 ? (
          <p className="mt-2 text-sm text-quiet">None bound yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {entry.plans.map((plan) => (
              <li key={plan.platformPlanId} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/plans/${plan.platformPlanId}`} className="font-mono text-accent">
                    {plan.ratePlanNew}
                  </Link>
                  <span className="ml-2 text-quiet">{plan.remarks}</span>
                  {!plan.active ? <span className="ml-2 text-xs text-danger">Deactivated</span> : null}
                  <p className="mt-0.5 text-xs text-quiet">
                    {plan.simCount} SIM{plan.simCount === 1 ? "" : "s"}
                    {plan.isDefault ? " · default" : ""}
                  </p>
                </div>
                <SetDefaultPlanButton
                  tenantId={entry.tenantId}
                  platformPlanId={plan.platformPlanId}
                  isDefault={plan.isDefault}
                />
                {entry.tenantActive ? (
                  <UnassignPlanButton
                    platformPlanId={plan.platformPlanId}
                    tenantId={entry.tenantId}
                    tenantName={entry.tenantName}
                    simCount={plan.simCount}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {entry.tenantActive ? (
          <div className="mt-3">
            <BindPlanToResellerForm
              key={`${entry.tenantId}-plans-${unbound.map((p) => p.id).join(",")}-${hasCatalogue ? "cat" : "nocat"}`}
              tenantId={entry.tenantId}
              plans={unbound}
              catalogueSkus={catalogueOptions.filter((sku) => sku.active !== false)}
              hasCatalogue={hasCatalogue}
            />
          </div>
        ) : null}
      </section>
    </article>
  );
}
