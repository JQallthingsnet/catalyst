import Link from "next/link";
import { redirect } from "next/navigation";
import { SimsInventoryPanel } from "@/components/portal/sims-inventory-panel";
import { requirePortal } from "@/lib/portal/guard";
import { listPlans, listSims, listSimsFilterOptions } from "@/lib/portal/repo";
import { btnPrimary, btnSecondary } from "@/lib/portal/button-styles";
import { can, simFieldsForRole } from "@/lib/portal/role-model";
import {
  normalizeSimsListFilter,
  SIM_CTD_OP_OPTIONS,
  simsListFilterActive,
  simsListFilterParams,
} from "@/lib/portal/sim-filter";

function FilterSelect({
  name,
  label,
  value,
  options,
  allLabel,
}: {
  name: string;
  label: string;
  value: string;
  options: Array<string | { value: string; label: string }>;
  allLabel: string;
}) {
  return (
    <label className="block text-xs font-medium text-quiet">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="mt-1 h-10 w-full truncate rounded-full border border-line bg-panel px-3 text-sm text-ink"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export default async function SimsPage({
  searchParams,
}: {
  searchParams?:
    | {
        q?: string;
        plan?: string;
        customer?: string;
        iccid?: string;
        imsi?: string;
        msisdn?: string;
        state?: string;
        ctdOp?: string;
        ctdMb?: string;
      }
    | Promise<{
        q?: string;
        plan?: string;
        customer?: string;
        iccid?: string;
        imsi?: string;
        msisdn?: string;
        state?: string;
        ctdOp?: string;
        ctdMb?: string;
      }>;
}) {
  const ctx = await requirePortal();
  const params = await Promise.resolve(searchParams ?? {});
  // Super admin commercial inventory is Estate / CC snapshot — not a third empty list.
  if (ctx.role === "super_admin") {
    const q = params.q?.trim();
    redirect(q ? `/dashboard/estate?q=${encodeURIComponent(q)}` : "/dashboard/estate");
  }

  const filter = normalizeSimsListFilter(params);
  const filtered = simsListFilterActive(filter);
  const filterKey = simsListFilterParams(filter).toString();

  const [sims, retailPlans, filterOptions] = await Promise.all([
    listSims(ctx.tenantId, filter, 5_000),
    can(ctx.role, "assign") ? listPlans(ctx.tenantId) : Promise.resolve([]),
    listSimsFilterOptions(ctx.tenantId, filter),
  ]);
  const fields = simFieldsForRole(ctx.role);
  // Change-plan targets: full catalogue. Filter dropdown: cascading subset.
  const planOptions = retailPlans.map((plan) => ({
    id: plan.id,
    label: plan.name,
  }));
  const filterPlanId = filter.planId ?? "";
  const filterPlanName =
    filterOptions.plans.find((plan) => plan.id === filterPlanId)?.label ??
    retailPlans.find((plan) => plan.id === filterPlanId)?.name ??
    sims.find((sim) => sim.planId === filterPlanId)?.planName ??
    null;
  const canChangePlan = can(ctx.role, "assign");
  const canLifecycle = can(ctx.role, "lifecycle");
  const canAssign = can(ctx.role, "assign");

  const headerLinks = (
    <>
      {can(ctx.role, "rate_plan.change") ? (
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
    <div>
      <SimsInventoryPanel
        sims={sims.map((sim) => ({
          id: sim.id,
          iccid: sim.iccid,
          tenantName: sim.tenantName,
          customerName: sim.customerName,
          planId: sim.planId,
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
        filterPlanId={filterPlanId || null}
        filterPlanName={filterPlanName}
        filterForm={
          <form
            key={filterKey || "sims-filters"}
            action="/dashboard/sims"
            className="mt-6 w-full space-y-4 rounded-card border border-line bg-panel p-4"
          >
            <label className="block text-xs font-medium text-quiet">
              Search
              <input
                name="q"
                defaultValue={filter.q ?? ""}
                placeholder="ICCID, IMSI, MSISDN, customer…"
                className="mt-1 h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm text-ink"
              />
            </label>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
              <FilterSelect
                name="state"
                label="SIM status"
                value={filter.state ?? ""}
                options={filterOptions.states}
                allLabel="All statuses"
              />
              <FilterSelect
                name="plan"
                label="Retail plan"
                value={filter.planId ?? ""}
                options={filterOptions.plans.map((plan) => ({
                  value: plan.id,
                  label: plan.label,
                }))}
                allLabel="All retail plans"
              />
              <FilterSelect
                name="customer"
                label="Customer"
                value={filter.customer ?? ""}
                options={filterOptions.customers}
                allLabel="All customers"
              />
              <label className="block text-xs font-medium text-quiet">
                CTD compare
                <select
                  name="ctdOp"
                  defaultValue={filter.ctdOp ?? ""}
                  className="mt-1 h-10 w-full truncate rounded-full border border-line bg-panel px-3 text-sm text-ink"
                >
                  <option value="">Any</option>
                  {SIM_CTD_OP_OPTIONS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-quiet">
                CTD MB
                <input
                  name="ctdMb"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={filter.ctdMb ?? ""}
                  placeholder="MB"
                  className="mt-1 h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm text-ink"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className={btnPrimary}>
                Apply filters
              </button>
              {filtered ? (
                <Link href="/dashboard/sims" className={btnSecondary}>
                  Clear
                </Link>
              ) : null}
              <p className="text-xs text-quiet">
                {sims.length.toLocaleString("en-AU")} SIM{sims.length === 1 ? "" : "s"}
                {filtered ? " match" : ""}
              </p>
            </div>
          </form>
        }
      />
    </div>
  );
}
