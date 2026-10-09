import Link from "next/link";
import { CcInventoryTable } from "@/components/portal/cc-inventory-table";
import { CcAutoPollToggle } from "@/components/portal/cc-auto-poll-toggle";
import { CcExportButton } from "@/components/portal/cc-export-button";
import { CcImportDialog } from "@/components/portal/cc-import-dialog";
import { SyncCcButton } from "@/components/portal/sync-cc-button";
import {
  ccFilterActive,
  ccInventorySummary,
  countCcDevices,
  getCcSyncState,
  listCcDevices,
  listCcFilterOptions,
  normalizeCcFilter,
  type CcDeviceFilter,
} from "@/lib/cc/devices";
import { requirePrivilege } from "@/lib/portal/guard";
import { formatAuDateTime } from "@/lib/portal/time";

const PAGE_SIZE = 50;

function snapshotFilterParams(filter: CcDeviceFilter): URLSearchParams {
  const sp = new URLSearchParams();
  if (filter.query) sp.set("q", filter.query);
  if (filter.supplier) sp.set("supplier", filter.supplier);
  if (filter.status) sp.set("status", filter.status);
  if (filter.ratePlan) sp.set("ratePlan", filter.ratePlan);
  if (filter.communicationPlan) sp.set("commPlan", filter.communicationPlan);
  if (filter.customer) sp.set("customer", filter.customer);
  if (filter.accountId) sp.set("accountId", filter.accountId);
  if (filter.modemId) sp.set("modemId", filter.modemId);
  if (filter.globalSimType) sp.set("globalSim", filter.globalSimType);
  if (filter.simProfileId) sp.set("simProfile", filter.simProfileId);
  if (filter.inSession) sp.set("inSession", filter.inSession);
  if (filter.dateField) sp.set("dateField", filter.dateField);
  if (filter.dateFrom) sp.set("dateFrom", filter.dateFrom);
  if (filter.dateTo) sp.set("dateTo", filter.dateTo);
  return sp;
}

function snapshotQuery(filter: CcDeviceFilter, page = 1): string {
  const sp = snapshotFilterParams(filter);
  if (page > 1) sp.set("page", String(page));
  const value = sp.toString();
  return value ? `/dashboard/estate/cc?${value}` : "/dashboard/estate/cc";
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

export default async function CcSnapshotPage({
  searchParams,
}: {
  searchParams?:
    | {
        q?: string;
        page?: string;
        supplier?: string;
        status?: string;
        ratePlan?: string;
        commPlan?: string;
        customer?: string;
        accountId?: string;
        modemId?: string;
        globalSim?: string;
        simProfile?: string;
        inSession?: string;
        dateField?: string;
        dateFrom?: string;
        dateTo?: string;
      }
    | Promise<{
        q?: string;
        page?: string;
        supplier?: string;
        status?: string;
        ratePlan?: string;
        commPlan?: string;
        customer?: string;
        accountId?: string;
        modemId?: string;
        globalSim?: string;
        simProfile?: string;
        inSession?: string;
        dateField?: string;
        dateFrom?: string;
        dateTo?: string;
      }>;
}) {
  await requirePrivilege("platform.estate");
  const params = await Promise.resolve(searchParams ?? {});
  const filter = normalizeCcFilter({
    query: params.q,
    supplier: params.supplier,
    status: params.status,
    ratePlan: params.ratePlan,
    communicationPlan: params.commPlan,
    customer: params.customer,
    accountId: params.accountId,
    modemId: params.modemId,
    globalSimType: params.globalSim,
    simProfileId: params.simProfile,
    inSession: params.inSession === "yes" || params.inSession === "no" ? params.inSession : "",
    dateField:
      params.dateField === "added" || params.dateField === "activated" || params.dateField === "updated"
        ? params.dateField
        : "",
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  const filtered = ccFilterActive(filter);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const [sync, devices, listed, summary, options] = await Promise.all([
    getCcSyncState(),
    listCcDevices(filter, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    filtered ? countCcDevices(filter) : Promise.resolve(null),
    ccInventorySummary(),
    listCcFilterOptions(),
  ]);
  const total = summary.total;
  const listedCount = listed ?? total;
  const pageCount = Math.max(1, Math.ceil(listedCount / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const from = listedCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, listedCount);
  const exportQuery = snapshotFilterParams(filter).toString();

  return (
    <div>
      <Link href="/dashboard/estate" className="text-sm text-quiet hover:text-accent">
        ← Estate
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-3xl font-semibold">Control Center snapshot</h1>
          <p className="mt-2 text-sm text-quiet">
            Copy of Control Center in D1. Use <span className="text-ink">Sync now</span> to pull the full Search window into D1 (progress bar; Auto poll stays off until done). After that, Auto poll keeps a short incremental window. Filter and export apply to the current view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CcAutoPollToggle enabled={sync.autoPoll} />
          <CcImportDialog />
          <CcExportButton queryString={exportQuery} />
          <SyncCcButton
            initialDevices={total}
            initialJasperTotal={sync.lastTotal}
            initialComplete={sync.lastPageComplete}
          />
        </div>
      </div>

      <div id="cc-sync-progress" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-card border border-line bg-panel p-5">
          <p className="text-sm text-quiet">Devices in copy</p>
          <p className="mt-2 text-3xl font-semibold">{total.toLocaleString("en-AU")}</p>
          <p className="mt-1 text-xs text-quiet">
            Last full Search total{" "}
            {sync.lastTotal != null && sync.lastTotal > 0 ? sync.lastTotal.toLocaleString("en-AU") : "—"}
            {sync.lastPageComplete
              ? " · incremental (only SIMs changed since last cycle)"
              : sync.lastTotal != null && sync.lastTotal > total
                ? ` · ${(sync.lastTotal - total).toLocaleString("en-AU")} still missing from this crawl`
                : ""}
          </p>
        </article>
        <article className="rounded-card border border-line bg-panel p-5">
          <p className="text-sm text-quiet">Activated</p>
          <p className="mt-2 text-3xl font-semibold">{summary.activated.toLocaleString("en-AU")}</p>
        </article>
        <article className="rounded-card border border-line bg-panel p-5">
          <p className="text-sm text-quiet">In session</p>
          <p className="mt-2 text-3xl font-semibold">{summary.inSession.toLocaleString("en-AU")}</p>
        </article>
        <article className="rounded-card border border-line bg-panel p-5">
          <p className="text-sm text-quiet">List crawl</p>
          <p className="mt-2 text-sm font-medium">
            {sync.lastPageComplete
              ? "Cycle complete (incremental)"
              : `Page ${sync.nextPage.toLocaleString("en-AU")}${
                  sync.lastPage != null ? ` · last fetched ${sync.lastPage.toLocaleString("en-AU")}` : ""
                }`}
          </p>
          <p className="mt-1 text-xs text-quiet">
            Search since {sync.modifiedSince ? formatAuDateTime(sync.modifiedSince) : "default ~360 days"}
            {sync.listCycleStartedAt && !sync.lastPageComplete
              ? ` · window walk since ${formatAuDateTime(sync.listCycleStartedAt)} (not advanced until last page)`
              : ""}
            {" · "}
            {sync.autoPoll ? "Auto poll ON" : "Auto poll OFF"}
            {" · "}
            Last poll {sync.lastPolledAt ? formatAuDateTime(sync.lastPolledAt) : "never"}
          </p>
        </article>
      </div>

      {sync.lastError ? (
        <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{sync.lastError}</p>
      ) : null}

      <form action="/dashboard/estate/cc" className="mt-6 w-full space-y-4 rounded-card border border-line bg-panel p-4">
        <label className="block text-xs font-medium text-quiet">
          Search
          <input
            name="q"
            defaultValue={filter.query ?? ""}
            placeholder="ICCID, IMSI, customer, notes, custom fields…"
            className="mt-1 h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm text-ink"
          />
        </label>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
          <label className="block text-xs font-medium text-quiet">
            Date field
            <select
              name="dateField"
              defaultValue={filter.dateField || "added"}
              className="mt-1 h-10 w-full truncate rounded-full border border-line bg-panel px-3 text-sm text-ink"
            >
              <option value="added">Added</option>
              <option value="activated">Activated</option>
              <option value="updated">Updated</option>
            </select>
          </label>
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
        <p className="text-xs text-quiet">Dates use Australia/Sydney calendar days. Leave From/To empty to ignore.</p>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
          <FilterSelect
            name="supplier"
            label="Supplier"
            value={filter.supplier ?? ""}
            options={options.suppliers}
            allLabel="All suppliers"
          />
          <FilterSelect
            name="status"
            label="SIM status"
            value={filter.status ?? ""}
            options={options.statuses}
            allLabel="All statuses"
          />
          <FilterSelect
            name="inSession"
            label="In session"
            value={filter.inSession ?? ""}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            allLabel="All"
          />
          <FilterSelect
            name="ratePlan"
            label="Rate plan"
            value={filter.ratePlan ?? ""}
            options={options.ratePlans}
            allLabel="All rate plans"
          />
          <FilterSelect
            name="commPlan"
            label="Communication plan"
            value={filter.communicationPlan ?? ""}
            options={options.communicationPlans}
            allLabel="All comm plans"
          />
          <FilterSelect
            name="customer"
            label="Customer"
            value={filter.customer ?? ""}
            options={options.customers}
            allLabel="All customers"
          />
          <FilterSelect
            name="accountId"
            label="Account ID"
            value={filter.accountId ?? ""}
            options={options.accountIds}
            allLabel="All account IDs"
          />
          <FilterSelect
            name="modemId"
            label="Modem ID"
            value={filter.modemId ?? ""}
            options={options.modemIds}
            allLabel="All modems"
          />
          <FilterSelect
            name="globalSim"
            label="Global SIM"
            value={filter.globalSimType ?? ""}
            options={options.globalSimTypes}
            allLabel="All global SIM types"
          />
          <FilterSelect
            name="simProfile"
            label="SIM profile"
            value={filter.simProfileId ?? ""}
            options={options.simProfileIds}
            allLabel="All SIM profiles"
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
              href="/dashboard/estate/cc"
              className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm hover:border-accent"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <div className="mt-4">
        <CcInventoryTable devices={devices} empty={filtered ? "No devices match these filters." : undefined} />
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
              href={snapshotQuery(filter, currentPage - 1)}
              className="inline-flex h-10 items-center rounded-full border border-line px-4 hover:border-accent"
            >
              Previous
            </Link>
          ) : null}
          {currentPage < pageCount ? (
            <Link
              href={snapshotQuery(filter, currentPage + 1)}
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
