import Link from "next/link";
import { PoolsDashboard } from "@/components/portal/pools-dashboard";
import { TenantDirectory } from "@/components/portal/tenant-directory";
import { ccInventorySummary } from "@/lib/cc/devices";
import { requirePortal } from "@/lib/portal/guard";
import { resolvePoolCustomerScope } from "@/lib/portal/pool-scope";
import {
  listPoolModemLatest,
  listPoolRatePlanLatest,
  snapshotPoolCustomerDailyIfNeeded,
  toPoolEntityFromModem,
  toPoolEntityFromRatePlan,
  type PoolEntityLatest,
} from "@/lib/portal/pools";
import { dashboardSummary } from "@/lib/portal/repo";
import { can } from "@/lib/portal/role-model";
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
  const showPools = can(ctx.role, "pool.view");
  const showActivity = can(ctx.role, "audit.view");
  const onPlatform = ctx.role === "super_admin" && ctx.tenantId === ctx.homeTenantId;
  // KPI uses live CTD even when role cannot open Pools (e.g. reseller operator).
  const needPoolKpi = !onPlatform;
  const [data, tenants, ccSummary, poolScope] = await Promise.all([
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
          detailsFresh24h: 0,
          detailsStale1to7d: 0,
          detailsOlder7d: 0,
          usageMb: 0,
        }),
    showPools || needPoolKpi ? resolvePoolCustomerScope(ctx) : Promise.resolve(null),
  ]);

  let poolRows: PoolEntityLatest[] = [];
  const poolGroupBy = poolScope?.unrestricted ? "rate_plan" : "modem";
  if (poolScope && (showPools || needPoolKpi)) {
    await snapshotPoolCustomerDailyIfNeeded();
    poolRows = poolScope.unrestricted
      ? (await listPoolRatePlanLatest()).map(toPoolEntityFromRatePlan)
      : (
          await listPoolModemLatest({
            exactCustomer: poolScope.exactCustomer,
          })
        ).map(toPoolEntityFromModem);
  }

  const poolCtdMb = poolRows.reduce((sum, row) => sum + row.ctdUsageMb, 0);
  const poolAllowanceMb = poolRows.reduce((sum, row) => sum + row.allowanceMb, 0);
  const poolUsedPct =
    poolAllowanceMb > 0 ? Math.round((poolCtdMb / poolAllowanceMb) * 100) : 0;
  const topPool = [...poolRows].sort((a, b) => b.ctdUsageMb - a.ctdUsageMb)[0];
  const poolHint = topPool?.name || "—";

  const resellers = excludeHomeTenant(tenants, ctx.homeTenantId);

  return (
    <div>
      <div>
        <p className="text-sm text-quiet">{ctx.tenantName}</p>
        <h1 className="mt-1 text-3xl font-semibold">Dashboard</h1>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {onPlatform ? (
          <>
            <Kpi label="CC devices" value={ccSummary.total.toLocaleString("en-AU")} hint="Snapshot copy" />
            <Kpi label="Activated" value={ccSummary.activated.toLocaleString("en-AU")} />
            <Kpi
              label="In session"
              value={ccSummary.inSession.toLocaleString("en-AU")}
              hint={`CTD <24h ${ccSummary.sessionFresh24h.toLocaleString("en-AU")} · >48h ${ccSummary.sessionOlder48h.toLocaleString("en-AU")}`}
            />
            <Kpi
              label="Details enriched age"
              value={ccSummary.detailsFresh24h.toLocaleString("en-AU")}
              hint={`${ccSummary.neverEnriched.toLocaleString("en-AU")} list-only · >24h ${(ccSummary.detailsStale1to7d + ccSummary.detailsOlder7d).toLocaleString("en-AU")}`}
            />
          </>
        ) : (
          <>
            <Kpi label="SIMs active" value={data.simsActive.toLocaleString("en-AU")} />
            <Kpi label="Pool used" value={`${poolUsedPct}%`} hint={poolHint} />
            <Kpi label="Open orders" value={String(data.openOrders)} />
            <Kpi label="Activations 24h" value={String(data.activations24h)} />
          </>
        )}
      </div>
      {onPlatform ? (
        <p className="mt-2 text-sm text-quiet">
          CC health from the Jasper snapshot — open{" "}
          <Link href="/dashboard/estate/cc" className="text-accent">
            CC snapshot
          </Link>{" "}
          for sync and inventory.
        </p>
      ) : null}

      {/* Organisations above chart */}
      {resellers.length > 0 || onPlatform ? (
        <div className="mt-8 space-y-3">
          <TenantDirectory tenants={resellers} currentId={ctx.tenantId} />
          <p className="text-sm text-quiet">
            See reseller organisations on{" "}
            <Link href="/dashboard/estate" className="text-accent">
              Estate
            </Link>
            , or{" "}
            <Link href="/dashboard/estate/allocate" className="text-accent">
              sell stock
            </Link>{" "}
            to bind a Jasper Customer to a reseller.
          </p>
        </div>
      ) : null}

      {/* Chart left · activity right (matched height) — activity needs audit.view */}
      {showPools || showActivity ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-5 lg:items-stretch">
          {showPools ? (
            <section className={`min-h-0 ${showActivity ? "lg:col-span-3" : "lg:col-span-5"}`}>
              <PoolsDashboard
                initialRows={poolRows}
                canEdit={false}
                scopedCustomer={poolScope?.unrestricted ? null : poolScope?.exactCustomer || null}
                platformView={Boolean(poolScope?.unrestricted)}
                groupBy={poolGroupBy}
                mode="chart"
              />
            </section>
          ) : null}

          {showActivity ? (
            <article className="flex h-full min-h-0 flex-col rounded-card border border-line bg-panel p-5 lg:col-span-2">
              <div className="flex shrink-0 items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">Recent activity</h2>
                <Link href="/dashboard/logs" className="text-xs text-accent hover:underline">
                  View all
                </Link>
              </div>
              <p className="mt-1 shrink-0 text-xs text-quiet">
                Audit log for this organisation (creates, deletes, assigns).
              </p>
              <ul className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
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
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
