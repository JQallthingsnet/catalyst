import Link from "next/link";
import { BindPlanToResellerForm } from "@/components/portal/bind-plan-to-reseller-form";
import { ContractCataloguePicker } from "@/components/portal/contract-catalogue-picker";
import { ContractRules } from "@/components/portal/contract-rules";
import { SetDefaultPlanButton } from "@/components/portal/set-default-plan-button";
import { UnassignPlanButton } from "@/components/portal/unassign-plan-button";
import { btnPrimary, btnSecondary } from "@/lib/portal/button-styles";
import type { ContractBookEntry, PlatformPlan } from "@/lib/portal/platform-plans";
import type { SimSku } from "@/lib/portal/skus";

function contractReady(entry: ContractBookEntry): boolean {
  return entry.tenantActive && entry.plans.length > 0 && entry.skus.length > 0;
}

function ContractStatusHint({ entry }: { entry: ContractBookEntry }) {
  const hasCatalogue = entry.skus.length > 0;
  if (!entry.tenantActive) {
    return (
      <span className="rounded-full border border-danger/50 px-2 py-0.5 text-[11px] text-danger">
        Deactivated
      </span>
    );
  }
  if (entry.plans.length === 0 && !hasCatalogue) {
    return (
      <span className="rounded-full border border-danger/50 px-2 py-0.5 text-[11px] text-danger">
        Needs catalogue + rate plan
      </span>
    );
  }
  if (entry.plans.length === 0 && hasCatalogue) {
    return (
      <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-quiet">
        Add a rate plan
      </span>
    );
  }
  if (entry.plans.length > 0 && !hasCatalogue) {
    return (
      <span className="rounded-full border border-danger/50 px-2 py-0.5 text-[11px] text-danger">
        Needs catalogue
      </span>
    );
  }
  return (
    <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ok">Ready</span>
  );
}

/** Bird’s-eye: one row per reseller — open for catalogue + Reseller Plans. */
export function ContractsAdminIndex({ book }: { book: ContractBookEntry[] }) {
  const readyCount = book.filter(contractReady).length;
  const planCount = book.reduce((sum, entry) => sum + entry.plans.length, 0);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <p className="text-sm text-quiet">ATN commercial view</p>
          <h1 className="mt-1 text-3xl font-semibold">Contract</h1>
          <p className="mt-2 text-sm text-quiet">
            Bird’s-eye of reseller contracts — catalogue SKUs and Reseller Plans on each organisation.
            Open an organisation to bind plans and tick Order SIMs products.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/admin" className={btnSecondary}>
            Add reseller
          </Link>
          <Link href="/dashboard/catalogue" className={btnSecondary}>
            Catalogue
          </Link>
          <Link href="/dashboard/plans/new?from=contract" className={btnPrimary}>
            Create Reseller Plan
          </Link>
        </div>
      </div>

      <ContractRules variant="super_admin" />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <article className="rounded-card border border-line bg-panel p-5">
          <p className="text-sm text-quiet">Organisations</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{book.length}</p>
        </article>
        <article className="rounded-card border border-line bg-panel p-5">
          <p className="text-sm text-quiet">Ready contracts</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{readyCount}</p>
        </article>
        <article className="rounded-card border border-line bg-panel p-5">
          <p className="text-sm text-quiet">Bound Reseller Plans</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{planCount}</p>
        </article>
      </div>

      {book.length === 0 ? (
        <p className="mt-6 text-sm text-quiet">
          No reseller organisations yet. Create one from{" "}
          <Link href="/dashboard/admin" className="text-accent">
            Admin
          </Link>
          .
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
          <table className="w-full min-w-180 text-left text-sm">
            <thead className="border-b border-line text-quiet">
              <tr>
                <th className="px-4 py-3 font-medium">Organisation</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Catalogue SKUs</th>
                <th className="px-4 py-3 font-medium">Reseller Plans</th>
                <th className="px-4 py-3 font-medium">Default plan</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {book.map((entry) => {
                const defaultPlan =
                  entry.plans.find((plan) => plan.isDefault)?.remarks ??
                  entry.plans[0]?.remarks ??
                  null;
                return (
                  <tr key={entry.tenantId} className="border-t border-line align-middle">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/contracts/${entry.tenantId}`}
                        className={`font-medium hover:text-accent ${
                          entry.tenantActive ? "text-ink" : "text-quiet"
                        }`}
                      >
                        {entry.tenantName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <ContractStatusHint entry={entry} />
                    </td>
                    <td className="px-4 py-3">{entry.skus.length.toLocaleString("en-AU")}</td>
                    <td className="px-4 py-3">{entry.plans.length.toLocaleString("en-AU")}</td>
                    <td className="max-w-48 px-4 py-3">
                      {defaultPlan ? (
                        <span className="wrap-break-word font-mono text-xs" title={defaultPlan}>
                          {defaultPlan}
                        </span>
                      ) : (
                        <span className="text-quiet">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dashboard/contracts/${entry.tenantId}`} className="text-accent">
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Inside one reseller: catalogue + Reseller Plans (same actions as before). */
export function ContractResellerDetail({
  entry,
  plans,
  catalogue,
}: {
  entry: ContractBookEntry;
  plans: PlatformPlan[];
  catalogue: SimSku[];
}) {
  const unbound = plans
    .filter((plan) => !entry.plans.some((bound) => bound.platformPlanId === plan.id))
    .map((plan) => ({
      id: plan.id,
      ratePlanNew: plan.ccRatePlan,
      remarks: plan.name,
    }));
  const hasCatalogue = entry.skus.length > 0;
  const catalogueOptions = catalogue.map((sku) => ({
    id: sku.id,
    name: sku.name,
    formFactor: sku.formFactor,
    active: sku.active,
  }));
  const boundIds = entry.skus.map((sku) => sku.skuId);

  return (
    <div>
      <Link href="/dashboard/contracts" className="text-sm text-quiet hover:text-accent">
        ← Contract
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold">{entry.tenantName}</h1>
            <ContractStatusHint entry={entry} />
          </div>
          <p className="mt-2 text-sm text-quiet">
            {entry.skus.length} catalogue SKU{entry.skus.length === 1 ? "" : "s"} · {entry.plans.length}{" "}
            Reseller Plan{entry.plans.length === 1 ? "" : "s"} on contract. Bind rate plans and tick Order
            SIMs products for this organisation.
          </p>
          {!entry.tenantActive ? (
            <p className="mt-2 text-sm text-danger">Organisation deactivated — binding is locked.</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/catalogue" className={btnSecondary}>
            Manage catalogue
          </Link>
          <Link href="/dashboard/plans/new?from=contract" className={btnPrimary}>
            Create Reseller Plan
          </Link>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <section className="rounded-card border border-line bg-panel p-5">
          <h2 className="text-sm font-semibold text-ink">Catalogue (Order SIMs)</h2>
          <p className="mt-1 text-xs text-quiet">
            Keep at least one product bound while rate plans remain on this contract.
          </p>
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
            <p className="mt-3 text-sm text-quiet">
              {boundIds.length === 0
                ? "None bound."
                : `${boundIds.length} catalogue SKU${boundIds.length === 1 ? "" : "s"} bound.`}
            </p>
          )}
        </section>

        <section className="rounded-card border border-line bg-panel p-5">
          <h2 className="text-sm font-semibold text-ink">Reseller Plans</h2>
          <p className="mt-1 text-xs text-quiet">Contracted Reseller Plans this organisation may sell on.</p>

          {entry.plans.length === 0 ? (
            <p className="mt-3 text-sm text-quiet">None bound yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas/40">
              {entry.plans.map((plan) => (
                <li
                  key={plan.platformPlanId}
                  className="flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center sm:gap-3"
                >
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
                  <div className="flex shrink-0 items-center gap-2">
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
                  </div>
                </li>
              ))}
            </ul>
          )}

          {entry.tenantActive ? (
            <div className="mt-4 rounded-xl border border-dashed border-line bg-canvas/40 p-3">
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
      </div>
    </div>
  );
}
