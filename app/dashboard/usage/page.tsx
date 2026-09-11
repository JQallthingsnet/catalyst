import { requirePortal } from "@/lib/portal/guard";
import { listAudit, listPools, listUsage } from "@/lib/portal/repo";

export default async function UsagePage() {
  const ctx = await requirePortal();
  const [usage, pools, audit] = await Promise.all([
    listUsage(ctx.tenantId),
    listPools(ctx.tenantId),
    listAudit(ctx.tenantId),
  ]);
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
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {pools.map((pool) => {
          const pct = pool.capMb ? Math.round((pool.usedMb / pool.capMb) * 100) : 0;
          return (
            <article key={pool.id} className="rounded-card border border-line bg-panel p-5">
              <p className="font-semibold">{pool.name}</p>
              <p className={`mt-2 text-2xl ${pct >= 100 ? "text-danger" : pct >= 80 ? "text-warn" : "text-ok"}`}>{pct}%</p>
              <p className="text-sm text-quiet">
                {pool.usedMb} / {pool.capMb} MB
              </p>
            </article>
          );
        })}
      </div>
      <ul className="mt-6 space-y-2 text-sm">
        {audit.slice(0, 12).map((item) => (
          <li key={item.id} className="rounded-card border border-line bg-panel px-4 py-3">
            {item.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
