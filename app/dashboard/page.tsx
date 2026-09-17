import Link from "next/link";
import { CcInventoryTable } from "@/components/portal/cc-inventory-table";
import { TenantDirectory } from "@/components/portal/tenant-directory";
import { ccInventorySummary, listCcDevices } from "@/lib/cc/devices";
import { can } from "@/lib/portal/role-model";
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
  const [data, tenants, ccDevices, ccSummary] = await Promise.all([
    dashboardSummary(ctx.tenantId),
    ctx.isSuperAdmin && ctx.role === "super_admin" ? listPlatformTenants(true) : Promise.resolve([]),
    ctx.isSuperAdmin && ctx.role === "super_admin" ? listCcDevices("", 50) : Promise.resolve([]),
    ctx.isSuperAdmin && ctx.role === "super_admin"
      ? ccInventorySummary()
      : Promise.resolve({ total: 0, activated: 0, inSession: 0, usageMb: 0 }),
  ]);
  const resellers = excludeHomeTenant(tenants, ctx.homeTenantId);
  const onPlatform = ctx.role === "super_admin" && ctx.tenantId === ctx.homeTenantId;
  const maxMb = Math.max(...data.usage.map((row) => row.mb), 1);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-quiet">{ctx.tenantName}</p>
          <h1 className="mt-1 text-3xl font-semibold">Dashboard</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(ctx.role, "wholesale.allocate") ? (
            <Link href="/dashboard/estate/allocate" className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-canvas">
              Sell stock
            </Link>
          ) : null}
          {can(ctx.role, "platform.estate") ? (
            <Link href="/dashboard/estate/cc" className="rounded-card border border-line px-4 py-2 text-sm text-ink hover:border-accent">
              CC snapshot
            </Link>
          ) : null}
          {can(ctx.role, "platform.plan") ? (
            <Link href="/dashboard/plans/new" className="rounded-card border border-line px-4 py-2 text-sm text-ink hover:border-accent">
              Create ATN plan
            </Link>
          ) : can(ctx.role, "plan.create") ? (
            <Link href="/dashboard/plans/new" className="rounded-card border border-line px-4 py-2 text-sm text-ink hover:border-accent">
              Copy to retail
            </Link>
          ) : null}
          {can(ctx.role, "pool.create") && !onPlatform ? (
            <Link href="/dashboard/pools/new" className="rounded-card border border-line px-4 py-2 text-sm text-ink hover:border-accent">
              Create pool
            </Link>
          ) : null}
          {can(ctx.role, "assign") && !onPlatform ? (
            <Link href="/dashboard/sims/assign" className="rounded-card border border-line px-4 py-2 text-sm text-ink hover:border-accent">
              Assign SIMs
            </Link>
          ) : null}
        </div>
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
            <Kpi label="In session" value={ccSummary.inSession.toLocaleString("en-AU")} />
            <Kpi label="Cycle usage" value={`${ccSummary.usageMb.toLocaleString("en-AU")} MB`} />
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

      {onPlatform ? (
        <div className="mt-6 space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">Control Center devices</h2>
            <Link href="/dashboard/estate/cc" className="text-sm text-accent">
              Open full snapshot
            </Link>
          </div>
          <CcInventoryTable devices={ccDevices} />
        </div>
      ) : null}

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
