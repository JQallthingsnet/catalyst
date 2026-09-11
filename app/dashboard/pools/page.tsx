import Link from "next/link";
import { requirePortal } from "@/lib/portal/guard";
import { formatIccid } from "@/lib/portal/ids";
import { listPools, listSims } from "@/lib/portal/repo";

export default async function PoolsPage() {
  const ctx = await requirePortal();
  const [pools, sims] = await Promise.all([listPools(ctx.tenantId), listSims(ctx.tenantId)]);

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Pools</h1>
          <p className="mt-1 text-sm text-quiet">Shared data caps. Alerts at 80% and 100%.</p>
        </div>
        <Link href="/dashboard/pools/new" className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-canvas">
          Create pool
        </Link>
      </div>

      <div className="mt-6 space-y-6">
        {pools.map((pool) => {
          const pct = pool.capMb ? Math.round((pool.usedMb / pool.capMb) * 100) : 0;
          const members = sims.filter((sim) => sim.poolId === pool.id);
          const alert = pct >= 100 ? "danger" : pct >= 80 ? "warn" : "ok";
          return (
            <article key={pool.id} className="rounded-card border border-line bg-panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{pool.name}</h2>
                  <p className="text-sm text-quiet">
                    {pool.type} · {(pool.capMb / 1024).toFixed(0)} GB · {pool.members} SIMs
                  </p>
                </div>
                <p className={`text-3xl font-semibold ${alert === "danger" ? "text-danger" : alert === "warn" ? "text-warn" : "text-ok"}`}>{pct}%</p>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-canvas">
                <div
                  className={`h-full ${alert === "danger" ? "bg-danger" : alert === "warn" ? "bg-warn" : "bg-accent"}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              {pct >= 80 ? (
                <p className={`mt-2 text-sm ${pct >= 100 ? "text-danger" : "text-warn"}`}>
                  Pool {pct >= 100 ? "100%" : "80%"} alert
                </p>
              ) : null}
              <table className="mt-4 w-full text-left text-sm">
                <thead className="text-quiet">
                  <tr>
                    <th className="py-2">ICCID</th>
                    <th>State</th>
                    <th>Customer</th>
                  </tr>
                </thead>
                <tbody>
                  {members.slice(0, 12).map((sim) => (
                    <tr key={sim.id} className="border-t border-line">
                      <td className="py-2 font-mono">{formatIccid(sim.iccid)}</td>
                      <td>{sim.state}</td>
                      <td>{sim.customerName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          );
        })}
      </div>
    </div>
  );
}
