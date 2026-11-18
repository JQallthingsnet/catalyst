import Link from "next/link";
import { ImeiChangesExportButton } from "@/components/portal/imei-changes-export-button";
import { requirePrivilege } from "@/lib/portal/guard";
import { formatIccid } from "@/lib/portal/ids";
import {
  countImeiChanges,
  imeiChangeFilterActive,
  listImeiChangeFilterOptions,
  listImeiChanges,
  normalizeImeiChangeFilter,
  type ImeiChangeFilter,
} from "@/lib/portal/imei-change";
import { btnPrimary, btnSecondary } from "@/lib/portal/button-styles";
import { formatAuDateTime } from "@/lib/portal/time";

const PAGE_SIZE = 50;

function changesFilterParams(filter: ImeiChangeFilter, onPlatform: boolean): URLSearchParams {
  const sp = new URLSearchParams();
  if (filter.query) sp.set("q", filter.query);
  if (onPlatform && filter.organisationId) sp.set("org", filter.organisationId);
  if (filter.fromImei) sp.set("fromImei", filter.fromImei);
  if (filter.toImei) sp.set("toImei", filter.toImei);
  if (filter.dateFrom) sp.set("dateFrom", filter.dateFrom);
  if (filter.dateTo) sp.set("dateTo", filter.dateTo);
  return sp;
}

function changesQuery(filter: ImeiChangeFilter, onPlatform: boolean, page = 1): string {
  const sp = changesFilterParams(filter, onPlatform);
  if (page > 1) sp.set("page", String(page));
  const value = sp.toString();
  return value ? `/dashboard/sims/imei-changes?${value}` : "/dashboard/sims/imei-changes";
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

export default async function ImeiChangesPage({
  searchParams,
}: {
  searchParams?:
    | {
        q?: string;
        page?: string;
        org?: string;
        fromImei?: string;
        toImei?: string;
        dateFrom?: string;
        dateTo?: string;
      }
    | Promise<{
        q?: string;
        page?: string;
        org?: string;
        fromImei?: string;
        toImei?: string;
        dateFrom?: string;
        dateTo?: string;
      }>;
}) {
  const ctx = await requirePrivilege("audit.view");
  const onPlatform = ctx.role === "super_admin" && ctx.tenantId === ctx.homeTenantId;
  const params = await Promise.resolve(searchParams ?? {});
  const filter = normalizeImeiChangeFilter({
    scopeTenantId: onPlatform ? undefined : ctx.tenantId,
    organisationId: onPlatform ? params.org : undefined,
    query: params.q,
    fromImei: params.fromImei,
    toImei: params.toImei,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  const filtered = imeiChangeFilterActive(filter);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const [changes, listedCount, options] = await Promise.all([
    listImeiChanges(filter, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    countImeiChanges(filter),
    listImeiChangeFilterOptions(filter),
  ]);
  const pageCount = Math.max(1, Math.ceil(listedCount / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const from = listedCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, listedCount);
  const exportQuery = changesFilterParams(filter, onPlatform).toString();
  const filterKey = changesFilterParams(filter, onPlatform).toString();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">IMEI changes</h1>
          <p className="mt-1 text-sm text-quiet">
            {onPlatform
              ? "Log of IMEI changes detected on CC poll. The CC snapshot still keeps one latest IMEI per ICCID."
              : "Log of IMEI changes detected for SIMs in your organisation. The live CC snapshot still shows the latest IMEI only."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImeiChangesExportButton queryString={exportQuery} />
          {onPlatform ? (
            <Link href="/dashboard/estate/cc" className={btnSecondary}>
              CC snapshot
            </Link>
          ) : (
            <Link href="/dashboard/sims" className={btnSecondary}>
              Back to SIMs
            </Link>
          )}
        </div>
      </div>

      <form
        key={filterKey || "imei-change-filters"}
        action="/dashboard/sims/imei-changes"
        className="mt-6 w-full space-y-4 rounded-card border border-line bg-panel p-4"
      >
        <label className="block text-xs font-medium text-quiet">
          Search
          <input
            name="q"
            defaultValue={filter.query ?? ""}
            placeholder="ICCID, IMEI, customer, modem ID, organisation…"
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
            name="fromImei"
            label="From IMEI"
            value={filter.fromImei ?? ""}
            options={options.fromImeis}
            allLabel="All from"
          />
          <FilterSelect
            name="toImei"
            label="To IMEI"
            value={filter.toImei ?? ""}
            options={options.toImeis}
            allLabel="All to"
          />
        </div>
        <p className="text-xs text-quiet">Australia/Sydney calendar days for From/To.</p>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={btnPrimary}>
            Apply filters
          </button>
          {filtered ? (
            <Link href="/dashboard/sims/imei-changes" className={btnSecondary}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <div className="mt-8 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="text-quiet">
            <tr>
              <th className="px-4 py-3">When</th>
              {onPlatform ? <th className="px-4 py-3">Organisation</th> : null}
              <th className="px-4 py-3">ICCID</th>
              <th className="px-4 py-3">From IMEI</th>
              <th className="px-4 py-3">To IMEI</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Rate plan</th>
              <th className="px-4 py-3">Modem ID</th>
              <th className="px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-4 py-3 whitespace-nowrap">{formatAuDateTime(row.detectedAt)}</td>
                {onPlatform ? <td className="px-4 py-3">{row.tenantName ?? "—"}</td> : null}
                <td className="px-4 py-3 font-mono">{formatIccid(row.iccid)}</td>
                <td className="px-4 py-3 font-mono">{row.fromImei}</td>
                <td className="px-4 py-3 font-mono">{row.toImei}</td>
                <td className="px-4 py-3">{row.customer ?? "—"}</td>
                <td className="px-4 py-3">{row.status ?? "—"}</td>
                <td className="px-4 py-3">{row.ratePlan ?? "—"}</td>
                <td className="px-4 py-3">{row.modemId ?? "—"}</td>
                <td className="px-4 py-3 text-quiet">{row.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {changes.length === 0 ? (
          <p className="px-4 py-8 text-sm text-quiet">
            {filtered ? "No IMEI changes match these filters." : "No IMEI changes recorded yet."}
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
