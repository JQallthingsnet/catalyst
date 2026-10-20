import Link from "next/link";
import { TenantDirectory } from "@/components/portal/tenant-directory";
import { ccInventorySummary } from "@/lib/cc/devices";
import { requirePortal } from "@/lib/portal/guard";
import { dashboardSummary } from "@/lib/portal/repo";
import { excludeHomeTenant, listPlatformTenants } from "@/lib/portal/tenant";

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
  const [data, tenants, ccSummary] = await Promise.all([
    dashboardSummary(ctx.tenantId),
    ctx.isSuperAdmin && ctx.role === "super_admin" ? listPlatformTenants(true) : Promise.resolve([]),
    ctx.isSuperAdmin && ctx.role === "super_admin"
      ? ccInventorySummary()
      : Promise.resolve({
          total: 0,
          activated: 0,
          inSession: 0,
          detailsEnriched: 0,
          neverEnriched: 0,
          sessionKnown: 0,
          sessionUnknown: 0,
          sessionFresh24h: 0,
          sessionStale24to48h: 0,
          sessionOlder48h: 0,
          detailsFresh7d: 0,
          detailsStale7to14d: 0,
          detailsOlder14d: 0,
          usageMb: 0,
        }),
  ]);
  const resellers = excludeHomeTenant(tenants, ctx.homeTenantId);
  const onPlatform = ctx.role === "super_admin" && ctx.tenantId === ctx.homeTenantId;
  const maxMb = Math.max(...data.usage.map((row) => row.mb), 1);

  return (
    <div>
      <div>
        <p className="text-sm text-quiet">{ctx.tenantName}</p>
        <h1 className="mt-1 text-3xl font-semibold">Dashboard</h1>
      </div>

      {resellers.length > 0 || onPlatform ? (
        <div className="mt-6 space-y-3">
          <TenantDirectory tenants={resellers} currentId={ctx.tenantId} />
          <p className="text-sm text-quiet">
            See every customer and warehouse, or{" "}
            <Link href="/dashboard/estate" className="text-accent">
              open Estate
            </Link>
            .{" "}
            <Link href="/dashboard/estate/allocate" className="text-accent">
              Sell stock
            </Link>{" "}
            to put SIMs in a reseller warehouse.
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {onPlatform ? (
          <>
            <Kpi label="CC devices" value={ccSummary.total.toLocaleString("en-AU")} hint="Snapshot copy" />
            <Kpi label="Activated" value={ccSummary.activated.toLocaleString("en-AU")} />
            <Kpi
              label="In session"
              value={ccSummary.inSession.toLocaleString("en-AU")}
              hint={`<24h ${ccSummary.sessionFresh24h.toLocaleString("en-AU")} · >48h ${ccSummary.sessionOlder48h.toLocaleString("en-AU")} · unknown ${ccSummary.sessionUnknown.toLocaleString("en-AU")}`}
            />
            <Kpi
              label="Details enriched"
              value={ccSummary.detailsEnriched.toLocaleString("en-AU")}
              hint={
                ccSummary.neverEnriched > 0
                  ? `${ccSummary.neverEnriched.toLocaleString("en-AU")} list-only · >14d ${ccSummary.detailsOlder14d.toLocaleString("en-AU")}`
                  : `<7d ${ccSummary.detailsFresh7d.toLocaleString("en-AU")} · 7–14d ${ccSummary.detailsStale7to14d.toLocaleString("en-AU")} · >14d ${ccSummary.detailsOlder14d.toLocaleString("en-AU")}`
              }
            />
          </>
        ) : (
          <>
            <Kpi label="SIMs active" value={data.simsActive.toLocaleString("en-AU")} />
            <Kpi label="Pool used" value={`${data.poolUsedPct}%`} hint={data.poolName} />
            <Kpi label="Open orders" value={String(data.openOrders)} />
            <Kpi label="Activations 24h" value={String(data.activations24h)} />
          </>
        )}
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
