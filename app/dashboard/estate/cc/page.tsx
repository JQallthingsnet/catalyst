import Link from "next/link";
import { CcInventoryTable } from "@/components/portal/cc-inventory-table";
import { CcAutoPollToggle } from "@/components/portal/cc-auto-poll-toggle";
import { SyncCcButton } from "@/components/portal/sync-cc-button";
import { ccInventorySummary, countCcDevices, getCcSyncState, listCcDevices } from "@/lib/cc/devices";
import { requirePrivilege } from "@/lib/portal/guard";
import { formatAuDateTime } from "@/lib/portal/time";

export default async function CcSnapshotPage({
  searchParams,
}: {
  searchParams?: { q?: string } | Promise<{ q?: string }>;
}) {
  await requirePrivilege("platform.estate");
  const params = await Promise.resolve(searchParams ?? {});
  const query = params.q ?? "";
  const [sync, devices, total, summary] = await Promise.all([
    getCcSyncState(),
    listCcDevices(query),
    countCcDevices(),
    ccInventorySummary(),
  ]);

  return (
    <div>
      <Link href="/dashboard/estate" className="text-sm text-quiet hover:text-accent">
        ← Estate
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Control Center snapshot</h1>
          <p className="mt-2 max-w-2xl text-sm text-quiet">
            All SIMs as Control Center sees them, stored in D1. Use Auto poll to let the Worker cron fill every page and
            SIM detail in the background. Sync runs one batch now.
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2">
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
            {sync.autoPoll ? "Auto poll ON · cron every minute" : "Auto poll OFF"}
            {" · "}
            {sync.configured ? "Secrets configured" : "Missing JASPER secrets"}
          </p>
        </article>
      </div>

      {sync.lastError ? (
        <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{sync.lastError}</p>
      ) : null}

      <form action="/dashboard/estate/cc" className="mt-6">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search ICCID, IMSI, or MSISDN"
          className="w-full max-w-md rounded-card border border-line bg-panel px-4 py-2.5 text-sm"
        />
      </form>

      <div className="mt-4">
        <CcInventoryTable devices={devices} />
      </div>
    </div>
  );
}
