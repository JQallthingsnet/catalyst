import Link from "next/link";
import { requirePortal } from "@/lib/portal/guard";
import { formatIccid } from "@/lib/portal/ids";
import { listAudit } from "@/lib/portal/repo";
import { can } from "@/lib/portal/role-model";
import { SIM_ALLOWANCE_ALERT_PCT, listSimModemUsage } from "@/lib/portal/sim-usage";
import { formatAuDateTime } from "@/lib/portal/time";

export default async function UsagePage({
  searchParams,
}: {
  searchParams?: { q?: string; alert?: string } | Promise<{ q?: string; alert?: string }>;
}) {
  const ctx = await requirePortal();
  const params = await Promise.resolve(searchParams ?? {});
  const q = params.q ?? "";
  const alertsOnly = params.alert === "1" || params.alert === "80";

  const [sims, audit] = await Promise.all([
    can(ctx.role, "pool.view")
      ? listSimModemUsage({
          q,
          minPct: alertsOnly ? SIM_ALLOWANCE_ALERT_PCT : undefined,
          limit: 500,
        })
      : Promise.resolve([]),
    listAudit(ctx.tenantId),
  ]);

  const alertCount = sims.filter(
    (sim) => sim.pct != null && sim.pct >= SIM_ALLOWANCE_ALERT_PCT,
  ).length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Usage & alerts</h1>
          <p className="mt-1 text-sm text-quiet">
            Per SIM: CTD MB ÷ modem_ID allowance. Super admins are emailed when a SIM reaches ≥
            {SIM_ALLOWANCE_ALERT_PCT}% (once per Sydney day).
          </p>
        </div>
        {can(ctx.role, "pool.view") ? (
          <Link href="/dashboard/pools" className="text-sm text-accent">
            Customer pools
          </Link>
        ) : null}
      </div>

      {can(ctx.role, "pool.view") ? (
        <>
          <form action="/dashboard/usage" className="mt-5 flex flex-wrap items-center gap-3">
            <input
              name="q"
              defaultValue={q}
              placeholder="Filter ICCID, modem_ID, or CC customer"
              className="h-10 min-w-0 flex-1 rounded-full border border-line bg-panel px-4 text-sm outline-none focus:border-accent sm:max-w-md"
            />
            <label className="flex items-center gap-2 text-sm text-quiet">
              <input type="checkbox" name="alert" value="1" defaultChecked={alertsOnly} />
              ≥{SIM_ALLOWANCE_ALERT_PCT}% only
            </label>
            <button
              type="submit"
              className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent"
            >
              Filter
            </button>
          </form>

          <p className="mt-3 text-sm text-quiet">
            {alertCount > 0 ? (
              <span className="text-warn">
                {alertCount.toLocaleString("en-AU")} SIM{alertCount === 1 ? "" : "s"} at ≥
                {SIM_ALLOWANCE_ALERT_PCT}%
              </span>
            ) : (
              <span>No SIMs at ≥{SIM_ALLOWANCE_ALERT_PCT}% in this view.</span>
            )}
            {" · "}
            Showing {sims.length.toLocaleString("en-AU")} row{sims.length === 1 ? "" : "s"}.
          </p>

          <div className="mt-4 overflow-x-auto rounded-card border border-line bg-panel">
            <table className="w-full min-w-180 text-left text-sm">
              <thead className="text-quiet">
                <tr>
                  <th className="px-4 py-3">ICCID</th>
                  <th className="px-4 py-3">CC customer</th>
                  <th className="px-4 py-3">modem_ID</th>
                  <th className="px-4 py-3">CTD MB</th>
                  <th className="px-4 py-3">Allowance MB</th>
                  <th className="px-4 py-3">%</th>
                  <th className="px-4 py-3">CC status</th>
                </tr>
              </thead>
              <tbody>
                {sims.map((sim) => {
                  const hot = sim.pct != null && sim.pct >= SIM_ALLOWANCE_ALERT_PCT;
                  const over = sim.pct != null && sim.pct >= 100;
                  return (
                    <tr key={sim.iccid} className="border-t border-line">
                      <td className="px-4 py-3 font-mono text-xs">{formatIccid(sim.iccid)}</td>
                      <td className="px-4 py-3">{sim.customer ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{sim.modemId ?? "—"}</td>
                      <td className="px-4 py-3">
                        {sim.ctdUsageMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}
                      </td>
                      <td className="px-4 py-3">
                        {sim.allowanceMb != null
                          ? sim.allowanceMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })
                          : "—"}
                      </td>
                      <td
                        className={`px-4 py-3 font-medium ${
                          over ? "text-danger" : hot ? "text-warn" : "text-ok"
                        }`}
                      >
                        {sim.pct != null ? `${sim.pct}%` : "—"}
                      </td>
                      <td className="px-4 py-3">{sim.status}</td>
                    </tr>
                  );
                })}
                {sims.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-quiet">
                      No SIMs match. Set modem allowances on Pools, then Sync / enrich CTD.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="mt-6 rounded-card border border-line bg-panel px-4 py-5 text-sm text-quiet">
          Per-SIM modem allowance usage is available to platform and reseller admins.
        </p>
      )}

      <div className="mt-8">
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
