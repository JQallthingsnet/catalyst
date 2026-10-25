import Link from "next/link";
import { LogsExportButton } from "@/components/portal/logs-export-button";
import {
  auditActionLabel,
  auditLogFilterActive,
  countAuditLogs,
  listAuditLogFilterOptions,
  listAuditLogs,
  normalizeAuditLogFilter,
  type AuditLogFilter,
} from "@/lib/portal/audit";
import { btnPrimary, btnSecondary } from "@/lib/portal/button-styles";
import { requirePrivilege } from "@/lib/portal/guard";
import { formatAuDateTime } from "@/lib/portal/time";

const PAGE_SIZE = 50;

function logsFilterParams(filter: AuditLogFilter, onPlatform: boolean): URLSearchParams {
  const sp = new URLSearchParams();
  if (filter.query) sp.set("q", filter.query);
  if (onPlatform && filter.organisationId) sp.set("org", filter.organisationId);
  if (filter.action) sp.set("action", filter.action);
  if (filter.actorEmail) sp.set("by", filter.actorEmail);
  if (filter.dateFrom) sp.set("dateFrom", filter.dateFrom);
  if (filter.dateTo) sp.set("dateTo", filter.dateTo);
  return sp;
}

function logsQuery(filter: AuditLogFilter, onPlatform: boolean, page = 1): string {
  const sp = logsFilterParams(filter, onPlatform);
  if (page > 1) sp.set("page", String(page));
  const value = sp.toString();
  return value ? `/dashboard/logs?${value}` : "/dashboard/logs";
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

export default async function LogsPage({
  searchParams,
}: {
  searchParams?:
    | {
        q?: string;
        page?: string;
        org?: string;
        action?: string;
        by?: string;
        dateFrom?: string;
        dateTo?: string;
      }
    | Promise<{
        q?: string;
        page?: string;
        org?: string;
        action?: string;
        by?: string;
        dateFrom?: string;
        dateTo?: string;
      }>;
}) {
  const ctx = await requirePrivilege("audit.view");
  const onPlatform = ctx.role === "super_admin";
  const params = await Promise.resolve(searchParams ?? {});
  const filter = normalizeAuditLogFilter({
    scopeTenantId: onPlatform ? undefined : ctx.tenantId,
    organisationId: onPlatform ? params.org : undefined,
    query: params.q,
    action: params.action,
    actorEmail: params.by,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  const filtered = auditLogFilterActive(filter);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const [rows, listedCount, options] = await Promise.all([
    listAuditLogs(filter, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    countAuditLogs(filter),
    listAuditLogFilterOptions({ scopeTenantId: filter.scopeTenantId }),
  ]);
  const pageCount = Math.max(1, Math.ceil(listedCount / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const from = listedCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, listedCount);
  const exportQuery = logsFilterParams(filter, onPlatform).toString();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Logs</h1>
          <p className="mt-1 text-sm text-quiet">
            {onPlatform
              ? "Portal activity across all organisations — who did what, and when. Export CSV downloads the current filtered view."
              : "Portal activity for your organisation — who did what, and when. Export CSV downloads the current filtered view."}
          </p>
        </div>
        <LogsExportButton queryString={exportQuery} />
      </div>

      <form action="/dashboard/logs" className="mt-6 w-full space-y-4 rounded-card border border-line bg-panel p-4">
        <label className="block text-xs font-medium text-quiet">
          Search
          <input
            name="q"
            defaultValue={filter.query ?? ""}
            placeholder="Actor, action, detail, organisation…"
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
        <p className="text-xs text-quiet">Dates use Australia/Sydney calendar days. Leave empty to ignore.</p>

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
            name="action"
            label="Action"
            value={filter.action ?? ""}
            options={options.actions.map((action) => ({
              value: action,
              label: auditActionLabel(action),
            }))}
            allLabel="All actions"
          />
          <FilterSelect
            name="by"
            label="Actor"
            value={filter.actorEmail ?? ""}
            options={options.actorEmails}
            allLabel="Anyone"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={btnPrimary}>
            Apply filters
          </button>
          {filtered ? (
            <Link href="/dashboard/logs" className={btnSecondary}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <p className="mt-4 text-sm text-quiet">
        {listedCount === 0
          ? "No matching activity."
          : `Showing ${from.toLocaleString("en-AU")}–${to.toLocaleString("en-AU")} of ${listedCount.toLocaleString("en-AU")}`}
      </p>

      <div className="mt-3 overflow-x-auto rounded-card border border-line">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-panel text-quiet">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              {onPlatform ? <th className="px-4 py-3 font-medium">Organisation</th> : null}
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line hover:bg-panel-2">
                <td className="whitespace-nowrap px-4 py-3 text-quiet">{formatAuDateTime(row.createdAt)}</td>
                <td className="px-4 py-3">{row.actorEmail}</td>
                {onPlatform ? <td className="px-4 py-3 text-quiet">{row.tenantName}</td> : null}
                <td className="px-4 py-3">{auditActionLabel(row.action)}</td>
                <td className="px-4 py-3">{row.detail}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={onPlatform ? 5 : 4}
                  className="px-4 py-10 text-center text-quiet"
                >
                  No activity yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {currentPage > 1 ? (
            <Link
              href={logsQuery(filter, onPlatform, currentPage - 1)}
              className="inline-flex h-9 items-center rounded-full border border-line px-3 text-sm hover:border-accent"
            >
              Previous
            </Link>
          ) : null}
          <span className="text-sm text-quiet">
            Page {currentPage} of {pageCount}
          </span>
          {currentPage < pageCount ? (
            <Link
              href={logsQuery(filter, onPlatform, currentPage + 1)}
              className="inline-flex h-9 items-center rounded-full border border-line px-3 text-sm hover:border-accent"
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
