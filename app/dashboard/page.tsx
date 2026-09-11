import Link from "next/link";
import { requirePortal } from "@/lib/portal/guard";
import { dashboardSummary } from "@/lib/portal/repo";

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-card border border-line bg-panel p-5">
      <p className="text-sm text-quiet">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-quiet">{hint}</p> : null}
    </article>
  );
}

export default async function DashboardPage() {
  const ctx = await requirePortal();
  const data = await dashboardSummary(ctx.tenantId);
  const maxMb = Math.max(...data.usage.map((row) => row.mb), 1);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-quiet">First screen after login</p>
          <h1 className="mt-1 text-3xl font-semibold">Dashboard</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/sims/order" className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-canvas">
            Order SIMs
          </Link>
          <Link href="/dashboard/plans/new" className="rounded-card border border-line px-4 py-2 text-sm text-ink hover:border-accent">
            Create plan
          </Link>
          <Link href="/dashboard/pools/new" className="rounded-card border border-line px-4 py-2 text-sm text-ink hover:border-accent">
            Create pool
          </Link>
          <Link href="/dashboard/sims/assign" className="rounded-card border border-line px-4 py-2 text-sm text-ink hover:border-accent">
            Assign SIMs
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="SIMs active" value={data.simsActive.toLocaleString("en-AU")} />
        <Kpi label="Pool used" value={`${data.poolUsedPct}%`} hint={data.poolName} />
        <Kpi label="Open orders" value={String(data.openOrders)} />
        <Kpi label="Activations 24h" value={String(data.activations24h)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <article className="rounded-card border border-line bg-panel p-5 lg:col-span-3">
          <h2 className="text-lg font-semibold">Usage 7 days</h2>
          <div className="mt-4 flex h-48 items-end gap-2">
            {data.usage.length === 0 ? (
              <p className="text-sm text-quiet">No usage yet. Control Center is source of rated usage.</p>
            ) : (
              data.usage.map((row) => (
                <div key={row.day} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t-lg bg-accent/80"
                    style={{ height: `${Math.max(8, (row.mb / maxMb) * 100)}%` }}
                    title={`${row.mb} MB`}
                  />
                  <span className="text-[10px] text-quiet">{row.day.slice(5)}</span>
                </div>
              ))
            )}
          </div>
        </article>
        <article className="rounded-card border border-line bg-panel p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">Activity</h2>
          <ul className="mt-4 space-y-3">
            {data.activity.length === 0 ? (
              <li className="text-sm text-quiet">No activity yet.</li>
            ) : (
              data.activity.map((item) => (
                <li key={item.id} className="border-b border-line pb-3 text-sm last:border-0">
                  <p className="text-ink">{item.detail}</p>
                  <p className="mt-1 text-xs text-quiet">{new Date(item.createdAt).toLocaleString("en-AU")}</p>
                </li>
              ))
            )}
          </ul>
        </article>
      </div>
    </div>
  );
}
