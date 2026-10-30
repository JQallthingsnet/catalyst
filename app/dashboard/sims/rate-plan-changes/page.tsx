import Link from "next/link";
import { PlanChangesExportButton } from "@/components/portal/plan-changes-export-button";
import { ResellerPlanDailyExportButton } from "@/components/portal/reseller-plan-daily-export-button";
import { ResellerPlanDailyMatrix } from "@/components/portal/reseller-plan-daily-matrix";
import { requirePrivilege } from "@/lib/portal/guard";
import { formatIccid } from "@/lib/portal/ids";
import {
  countRatePlanChanges,
  listRatePlanChangeFilterOptions,
  listRatePlanChanges,
  normalizeRatePlanChangeFilter,
  ratePlanChangeFilterActive,
  type RatePlanChangeFilter,
} from "@/lib/portal/rate-plan-change";
import { listSimPlatformPlanDailyMatrix } from "@/lib/portal/sim-platform-plan-daily";
import { btnPrimary, btnSecondary } from "@/lib/portal/button-styles";
import { formatAuDateTime, sydneyDayKey, sydneyMonthStartDayKey } from "@/lib/portal/time";

const PAGE_SIZE = 50;

function changesFilterParams(filter: RatePlanChangeFilter, onPlatform: boolean): URLSearchParams {
  const sp = new URLSearchParams();
  if (filter.query) sp.set("q", filter.query);
  if (onPlatform && filter.organisationId) sp.set("org", filter.organisationId);
  if (filter.fromRatePlan) sp.set("fromPlan", filter.fromRatePlan);
  if (filter.toRatePlan) sp.set("toPlan", filter.toRatePlan);
  if (filter.simState) sp.set("state", filter.simState);
  if (filter.currentState) sp.set("current", filter.currentState);
  if (filter.supplierCode) sp.set("supplierCode", filter.supplierCode);
  if (filter.pushStatus) sp.set("push", filter.pushStatus);
  if (filter.actorEmail) sp.set("by", filter.actorEmail);
  if (filter.dateFrom) sp.set("dateFrom", filter.dateFrom);
  if (filter.dateTo) sp.set("dateTo", filter.dateTo);
  return sp;
}

function pushStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending push";
    case "pushed":
      return "Pushed";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    default:
      return status;
  }
}

function changesQuery(filter: RatePlanChangeFilter, onPlatform: boolean, page = 1): string {
  const sp = changesFilterParams(filter, onPlatform);
  if (page > 1) sp.set("page", String(page));
  const value = sp.toString();
  return value ? `/dashboard/sims/rate-plan-changes?${value}` : "/dashboard/sims/rate-plan-changes";
}

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

export default async function RatePlanChangesPage({
  searchParams,
}: {
  searchParams?:
    | {
        q?: string;
        page?: string;
        org?: string;
        fromPlan?: string;
        toPlan?: string;
        state?: string;
        current?: string;
        supplierCode?: string;
        push?: string;
        by?: string;
        dateFrom?: string;
        dateTo?: string;
      }
    | Promise<{
        q?: string;
        page?: string;
        org?: string;
        fromPlan?: string;
        toPlan?: string;
        state?: string;
        current?: string;
        supplierCode?: string;
        push?: string;
        by?: string;
        dateFrom?: string;
        dateTo?: string;
      }>;
}) {
  const ctx = await requirePrivilege("rate_plan.change");
  const onPlatform = ctx.role === "super_admin" && ctx.tenantId === ctx.homeTenantId;
  const params = await Promise.resolve(searchParams ?? {});
  const filter = normalizeRatePlanChangeFilter({
    scopeTenantId: onPlatform ? undefined : ctx.tenantId,
    organisationId: onPlatform ? params.org : undefined,
    query: params.q,
    fromRatePlan: params.fromPlan,
    toRatePlan: params.toPlan,
    simState: params.state,
    currentState: params.current,
    supplierCode:
      params.supplierCode === "ok" || params.supplierCode === "mismatch" ? params.supplierCode : "",
    pushStatus:
      params.push === "pending" ||
      params.push === "pushed" ||
      params.push === "failed" ||
      params.push === "skipped"
        ? params.push
        : "",
    actorEmail: params.by,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  const filtered = ratePlanChangeFilterActive(filter);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  // Reseller: own org. Super admin: all ICCIDs, or one org when Organisation filter is set.
  const matrixTenantId = onPlatform ? filter.organisationId || undefined : ctx.tenantId;
  // Daily matrix defaults to Sydney month-to-date when From/To are blank.
  const matrixDateFrom = filter.dateFrom || sydneyMonthStartDayKey();
  const matrixDateTo = filter.dateTo || sydneyDayKey();
  const [changes, listedCount, options, dailyMatrix] = await Promise.all([
    listRatePlanChanges(filter, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    countRatePlanChanges(filter),
    listRatePlanChangeFilterOptions({ scopeTenantId: filter.scopeTenantId }),
    listSimPlatformPlanDailyMatrix({
      tenantId: matrixTenantId,
      dateFrom: matrixDateFrom,
      dateTo: matrixDateTo,
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(listedCount / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const from = listedCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, listedCount);
  const exportQuery = changesFilterParams(filter, onPlatform).toString();
  const dailyExport = new URLSearchParams();
  if (onPlatform && filter.organisationId) dailyExport.set("org", filter.organisationId);
  dailyExport.set("dateFrom", matrixDateFrom);
  dailyExport.set("dateTo", matrixDateTo);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Plan changes</h1>
          <p className="mt-1 text-sm text-quiet">
            {onPlatform
              ? "Log of Reseller Plan changes. Billing follows the Catalyst plan; Jasper update is optional for ATN."
              : "Log of Reseller Plan changes for your organisation. Billing follows the plan on each SIM in Catalyst. Changes are allowed any time."}{" "}
            Change-log CSV uses the filters below. Daily plans CSV lists every Reseller Plan used per ICCID per
            Sydney day (multiple rows if the plan changed that day).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ResellerPlanDailyExportButton queryString={dailyExport.toString()} />
          <PlanChangesExportButton queryString={exportQuery} />
          <Link href="/dashboard/sims" className={btnSecondary}>
            Back to SIMs
          </Link>
        </div>
      </div>

      <form
        action="/dashboard/sims/rate-plan-changes"
        className="mt-6 w-full space-y-4 rounded-card border border-line bg-panel p-4"
      >
        <label className="block text-xs font-medium text-quiet">
          Search
          <input
            name="q"
            defaultValue={filter.query ?? ""}
            placeholder="ICCID, Reseller Plan, organisation, changed by…"
            className="mt-1 h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm text-ink"
          />
        </label>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
          <label className="block text-xs font-medium text-quiet">
            From
            <input
              type="date"
              name="dateFrom"
              defaultValue={matrixDateFrom}
              className="mt-1 h-10 w-full rounded-full border border-line bg-panel px-3 text-sm text-ink"
            />
          </label>
          <label className="block text-xs font-medium text-quiet">
            To
            <input
              type="date"
              name="dateTo"
              defaultValue={matrixDateTo}
              className="mt-1 h-10 w-full rounded-full border border-line bg-panel px-3 text-sm text-ink"
            />
          </label>
        </div>
        <p className="text-xs text-quiet">
          Australia/Sydney calendar days. Daily matrix defaults to this month (1st → today); change log uses the same
          range when you Apply.
        </p>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
          {onPlatform ? (
            <FilterSelect
              name="org"
              label="Organisation"
              value={filter.organisationId ?? ""}
              options={options.organisations.map((org) => ({ value: org.id, label: org.name }))}
              allLabel="All organisations"
            />
          ) : null}
          <FilterSelect
            name="fromPlan"
            label="From Reseller Plan"
            value={filter.fromRatePlan ?? ""}
            options={options.fromRatePlans}
            allLabel="All from"
          />
          <FilterSelect
            name="toPlan"
            label="To Reseller Plan"
            value={filter.toRatePlan ?? ""}
            options={options.toRatePlans}
            allLabel="All to"
          />
          <FilterSelect
            name="state"
            label="State at change"
            value={filter.simState ?? ""}
            options={options.simStates}
            allLabel="All states"
          />
          <FilterSelect
            name="current"
            label="Current state"
            value={filter.currentState ?? ""}
            options={options.currentStates}
            allLabel="All current states"
          />
          {onPlatform ? (
            <>
              <FilterSelect
                name="supplierCode"
                label="Snapshot"
                value={filter.supplierCode ?? ""}
                options={[
                  { value: "ok", label: "OK" },
                  { value: "mismatch", label: "Snapshot differs" },
                ]}
                allLabel="All"
              />
              <FilterSelect
                name="push"
                label="Push status"
                value={filter.pushStatus ?? ""}
                options={[
                  { value: "pending", label: "Pending push" },
                  { value: "pushed", label: "Pushed" },
                  { value: "failed", label: "Failed" },
                  { value: "skipped", label: "Skipped" },
                ]}
                allLabel="All push states"
              />
            </>
          ) : null}
          <FilterSelect
            name="by"
            label="Changed by"
            value={filter.actorEmail ?? ""}
            options={options.actorEmails}
            allLabel="Anyone"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className={btnPrimary}
          >
            Apply filters
          </button>
          {filtered ? (
            <Link href="/dashboard/sims/rate-plan-changes" className={btnSecondary}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <section className="mt-8 space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Daily Reseller Plans</h2>
          <p className="mt-1 text-sm text-quiet">
            Rows are ICCIDs
            {onPlatform ? " (all organisations, or filter Organisation above)" : ""}; every Sydney calendar day in
            From/To is a column (default this calendar month). Cell value is how many Reseller Plans applied that day
            (1 = unchanged, 2+ = changed). Click a cell for plan names.
          </p>
        </div>
        <ResellerPlanDailyMatrix matrix={dailyMatrix} />
      </section>

      <h2 className="mt-10 text-lg font-semibold">Change log</h2>
      <div className="mt-3 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="text-quiet">
            <tr>
              <th className="px-4 py-3">When</th>
              {onPlatform ? <th className="px-4 py-3">Organisation</th> : null}
              <th className="px-4 py-3">ICCID</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">To</th>
              <th className="px-4 py-3">State at change</th>
              <th className="px-4 py-3">Current</th>
              {onPlatform ? <th className="px-4 py-3">Snapshot</th> : null}
              {onPlatform ? <th className="px-4 py-3">Push</th> : null}
              <th className="px-4 py-3">By</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-4 py-3 whitespace-nowrap">{formatAuDateTime(row.createdAt)}</td>
                {onPlatform ? <td className="px-4 py-3">{row.tenantName}</td> : null}
                <td className="px-4 py-3 font-mono">{formatIccid(row.iccid)}</td>
                <td className="px-4 py-3">{row.fromRatePlan ?? "—"}</td>
                <td className="px-4 py-3">{row.toRatePlan}</td>
                <td className="px-4 py-3">{row.simState}</td>
                <td className="px-4 py-3">{row.simStatus ?? "—"}</td>
                {onPlatform ? (
                  <td className="px-4 py-3">
                    {row.tcodeMismatch ? (
                      <span
                        className="text-quiet"
                        title="CC snapshot Reseller Plan differs; billing still uses the Catalyst plan"
                      >
                        Snapshot differs
                      </span>
                    ) : (
                      <span className="text-quiet">OK</span>
                    )}
                  </td>
                ) : null}
                {onPlatform ? (
                  <td className="px-4 py-3">
                    <span
                      className={
                        row.pushStatus === "failed"
                          ? "text-danger"
                          : row.pushStatus === "pushed"
                            ? "text-ink"
                            : "text-quiet"
                      }
                    >
                      {pushStatusLabel(row.pushStatus)}
                    </span>
                    {row.pushedAt ? (
                      <p className="mt-0.5 text-xs text-quiet">{formatAuDateTime(row.pushedAt)}</p>
                    ) : null}
                    {row.pushError ? (
                      <p className="mt-0.5 max-w-48 text-xs text-quiet" title={row.pushError}>
                        {row.pushError}
                      </p>
                    ) : null}
                  </td>
                ) : null}
                <td className="px-4 py-3 text-quiet">{row.actorEmail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {changes.length === 0 ? (
          <p className="px-4 py-8 text-sm text-quiet">
            {filtered ? "No plan changes match these filters." : "No rate-plan changes recorded yet."}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-quiet">
        <p>
          {listedCount === 0
            ? "No rows"
            : `Showing ${from.toLocaleString("en-AU")}–${to.toLocaleString("en-AU")} of ${listedCount.toLocaleString("en-AU")}${filtered ? " matching" : ""}`}
        </p>
        <div className="flex gap-2">
          {currentPage > 1 ? (
            <Link
              href={changesQuery(filter, onPlatform, currentPage - 1)}
              className="inline-flex h-10 items-center rounded-full border border-line px-4 hover:border-accent"
            >
              Previous
            </Link>
          ) : null}
          {currentPage < pageCount ? (
            <Link
              href={changesQuery(filter, onPlatform, currentPage + 1)}
              className="inline-flex h-10 items-center rounded-full border border-line px-4 hover:border-accent"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
