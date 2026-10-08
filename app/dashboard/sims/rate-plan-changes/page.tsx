import Link from "next/link";
import { PlanChangesExportButton } from "@/components/portal/plan-changes-export-button";
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
import { formatAuDateTime } from "@/lib/portal/time";

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
  const [changes, listedCount, options] = await Promise.all([
    listRatePlanChanges(filter, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    countRatePlanChanges(filter),
    listRatePlanChangeFilterOptions({ scopeTenantId: filter.scopeTenantId }),
  ]);
  const pageCount = Math.max(1, Math.ceil(listedCount / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const from = listedCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, listedCount);
  const exportQuery = changesFilterParams(filter, onPlatform).toString();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Plan changes</h1>
          <p className="mt-1 text-sm text-quiet">
            {onPlatform
              ? "Rate-plan change log across reseller ICCIDs. New changes queue as Pending push (Jasper write still on hold)."
              : "Rate-plan change log for your organisation’s ICCIDs. New changes queue as Pending push until supplier sync is enabled."}{" "}
            Export CSV downloads the current filtered view (all matching rows).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PlanChangesExportButton queryString={exportQuery} />
          <Link href="/dashboard/sims" className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent">
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
            placeholder="ICCID, rate plan, organisation, changed by…"
            className="mt-1 h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm text-ink"
          />
        </label>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
          <label className="block text-xs font-medium text-quiet">
            From
            <input
              type="date"
              name="dateFrom"
              defaultValue={filter.dateFrom ?? ""}
              className="mt-1 h-10 w-full rounded-full border border-line bg-panel px-3 text-sm text-ink"
            />
          </label>
          <label className="block text-xs font-medium text-quiet">
            To
            <input
              type="date"
              name="dateTo"
              defaultValue={filter.dateTo ?? ""}
              className="mt-1 h-10 w-full rounded-full border border-line bg-panel px-3 text-sm text-ink"
            />
          </label>
        </div>
        <p className="text-xs text-quiet">When dates use Australia/Sydney calendar days. Leave empty to ignore.</p>

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
            label="From rate plan"
            value={filter.fromRatePlan ?? ""}
            options={options.fromRatePlans}
            allLabel="All from plans"
          />
          <FilterSelect
            name="toPlan"
            label="To rate plan"
            value={filter.toRatePlan ?? ""}
            options={options.toRatePlans}
            allLabel="All to plans"
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
          <FilterSelect
            name="supplierCode"
            label="Supplier code"
            value={filter.supplierCode ?? ""}
            options={[
              { value: "ok", label: "OK" },
              { value: "mismatch", label: "Mismatch" },
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
            className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-medium text-accent-ink"
          >
            Apply filters
          </button>
          {filtered ? (
            <Link
              href="/dashboard/sims/rate-plan-changes"
              className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm hover:border-accent"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
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
              <th className="px-4 py-3">Supplier code</th>
              <th className="px-4 py-3">Push</th>
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
                <td className="px-4 py-3">
                  {row.tcodeMismatch ? (
                    <span className="text-danger">Mismatch vs supplier snapshot</span>
                  ) : (
                    <span className="text-quiet">OK</span>
                  )}
                </td>
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
