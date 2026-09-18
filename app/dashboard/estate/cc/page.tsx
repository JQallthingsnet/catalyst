import Link from "next/link";
import { CcInventoryTable } from "@/components/portal/cc-inventory-table";
import { CcAutoPollToggle } from "@/components/portal/cc-auto-poll-toggle";
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

function snapshotQuery(filter: CcDeviceFilter, page = 1): string {
  const sp = new URLSearchParams();
  if (filter.query) sp.set("q", filter.query);
  if (filter.status) sp.set("status", filter.status);
  if (filter.ratePlan) sp.set("ratePlan", filter.ratePlan);
  if (filter.communicationPlan) sp.set("commPlan", filter.communicationPlan);
  if (filter.inSession) sp.set("inSession", filter.inSession);
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
        className="mt-1 h-10 w-full rounded-full border border-line bg-panel px-3 text-sm text-ink"
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
    | { q?: string; page?: string; status?: string; ratePlan?: string; commPlan?: string; inSession?: string }
    | Promise<{ q?: string; page?: string; status?: string; ratePlan?: string; commPlan?: string; inSession?: string }>;
}) {
  await requirePrivilege("platform.estate");
  const params = await Promise.resolve(searchParams ?? {});
  const filter = normalizeCcFilter({
    query: params.q,
    status: params.status,
    ratePlan: params.ratePlan,
    communicationPlan: params.commPlan,
    inSession: params.inSession === "yes" || params.inSession === "no" ? params.inSession : "",
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

  return (
    <div>
      <Link href="/dashboard/estate" className="text-sm text-quiet hover:text-accent">
        ← Estate
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-3xl font-semibold">Control Center snapshot</h1>
          <p className="mt-2 text-sm text-quiet">
            Copy of Control Center in D1. Filter by the same fields CC uses (status, plans, session). Search is ICCID,
            IMSI, or MSISDN.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CcAutoPollToggle enabled={sync.autoPoll} />
          <SyncCcButton />
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-card border border-line bg-panel p-5">
          <p className="text-sm text-quiet">Devices in copy</p>
          <p className="mt-2 text-3xl font-semibold">{total.toLocaleString("en-AU")}</p>
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
          <p className="text-sm text-quiet">Last poll</p>
          <p className="mt-2 text-sm font-medium">
            {sync.lastPolledAt ? formatAuDateTime(sync.lastPolledAt) : "Never"}
          </p>
          <p className="mt-1 text-xs text-quiet">
            {sync.autoPoll ? "Auto poll ON · cron every 15 minutes" : "Auto poll OFF"}
            {" · "}
            {sync.configured ? "Secrets configured" : "Missing JASPER secrets"}
          </p>
        </article>
      </div>

      {sync.lastError ? (
        <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{sync.lastError}</p>
      ) : null}

      <form action="/dashboard/estate/cc" className="mt-6 rounded-card border border-line bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="block text-xs font-medium text-quiet sm:col-span-2 xl:col-span-1">
            Search
            <input
              name="q"
              defaultValue={filter.query ?? ""}
              placeholder="ICCID, IMSI, or MSISDN"
              className="mt-1 h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm text-ink"
            />
          </label>
          <FilterSelect
            name="status"
            label="SIM status"
            value={filter.status ?? ""}
            options={options.statuses}
            allLabel="All statuses"
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
            name="inSession"
            label="In session"
            value={filter.inSession ?? ""}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            allLabel="All"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-medium text-canvas"
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
