import Link from "next/link";
import { requirePortal } from "@/lib/portal/guard";
import { listAudit, listUsage } from "@/lib/portal/repo";
import { can } from "@/lib/portal/role-model";
import { formatAuDateTime } from "@/lib/portal/time";

export default async function UsagePage() {
  const ctx = await requirePortal();
  const [usage, audit] = await Promise.all([listUsage(ctx.tenantId), listAudit(ctx.tenantId)]);
  const maxMb = Math.max(...usage.map((row) => row.mb), 1);
  const asOf = usage.at(-1)?.day ?? "—";

  return (
    <div>
      <h1 className="text-3xl font-semibold">Usage & alerts</h1>
      <p className="mt-1 text-sm text-quiet">Rated usage as-of {asOf}. Control Center is source of radio usage.</p>
      <div className="mt-6 rounded-card border border-line bg-panel p-5">
        <div className="flex h-48 items-end gap-2">
          {usage.map((row) => (
            <div key={row.day} className="flex flex-1 flex-col items-center gap-2">
              <div className="w-full rounded-t-lg bg-accent/80" style={{ height: `${Math.max(8, (row.mb / maxMb) * 100)}%` }} />
              <span className="text-[10px] text-quiet">{row.day.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>
      {can(ctx.role, "pool.view") ? (
        <p className="mt-4 text-sm text-quiet">
          CC customer modem pools and daily CTD snapshots live on{" "}
          <Link href="/dashboard/pools" className="text-accent">
            Pools
          </Link>
          .
        </p>
      ) : null}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
        <p className="mt-1 text-xs text-quiet">Portal audit log for this organisation (not the Plan changes book).</p>
        <ul className="mt-3 space-y-2 text-sm">
          {audit.slice(0, 12).map((item) => (
            <li key={item.id} className="rounded-card border border-line bg-panel px-4 py-3">
              <p className="text-xs text-quiet">{formatAuDateTime(item.createdAt)}</p>
              <p className="mt-1 text-ink">{item.detail}</p>
            </li>
          ))}
          {audit.length === 0 ? (
            <li className="rounded-card border border-line bg-panel px-4 py-8 text-quiet">No activity yet.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
