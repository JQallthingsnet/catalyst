import Link from "next/link";
import { SendUsageDigestButton } from "@/components/portal/send-usage-digest-button";
import { requirePortal } from "@/lib/portal/guard";
import { listAudit } from "@/lib/portal/repo";
import { can } from "@/lib/portal/role-model";
import {
  SIM_ALLOWANCE_ALERT_PCT,
  listSimModemUsage,
  type UsageAllowanceBasis,
} from "@/lib/portal/sim-usage";
import { loadTenant } from "@/lib/portal/tenant";
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

  const basis: UsageAllowanceBasis = ctx.role === "super_admin" ? "rate_plan" : "modem";
  const tenant = basis === "modem" ? await loadTenant(ctx.tenantId) : null;
  const customerScope = tenant?.ccCustomer ?? "";

  const [sims, audit] = await Promise.all([
    can(ctx.role, "pool.view")
      ? listSimModemUsage({
          basis,
          customer: customerScope,
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
            {basis === "rate_plan"
              ? "Super admin: per SIM, CTD MB ÷ Jasper/CC rate plan allowance (mapped on Pools). Daily email is the Pools digest (rate plans ≥"
              : "Reseller: per SIM, CTD MB ÷ modem_ID allowance. Daily email covers Pools (modem_ID) and this Usage list when any row is ≥"}
            {SIM_ALLOWANCE_ALERT_PCT}%
            {basis === "rate_plan"
              ? ") to Jerry Qiu near Sydney midnight — not the per-SIM Usage list."
              : " (reseller admins)."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {can(ctx.role, "pool.view") ? (
            <Link href="/dashboard/pools" className="text-sm text-accent">
              {basis === "rate_plan" ? "Pools · rate plan allowances" : "Customer pools"}
            </Link>
          ) : null}
          {basis === "rate_plan" && can(ctx.role, "pool.create") ? <SendUsageDigestButton /> : null}
        </div>
      </div>

      {can(ctx.role, "pool.view") ? (
        <>
          {basis === "modem" && !customerScope ? (
            <p className="mt-4 rounded-card border border-line bg-panel px-4 py-3 text-sm text-quiet">
              This organisation is not bound to a Control Center customer yet. Sell stock / bind first to
              scope Usage to your SIMs.
            </p>
          ) : null}

          <form action="/dashboard/usage" className="mt-5 flex flex-wrap items-center gap-3">
            <input
              name="q"
              defaultValue={q}
              placeholder={
                basis === "rate_plan"
                  ? "Filter ICCID, rate plan, or CC customer"
                  : "Filter ICCID, modem_ID, or CC customer"
              }
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
            Showing {sims.length.toLocaleString("en-AU")} row{sims.length === 1 ? "" : "s"}
            {customerScope ? ` · CC customer ${customerScope}` : ""}.
          </p>

          <div className="mt-4 overflow-x-auto rounded-card border border-line bg-panel">
            <table className="w-full min-w-180 text-left text-sm">
              <thead className="text-quiet">
                <tr>
                  <th className="px-4 py-3">ICCID</th>
                  <th className="px-4 py-3">CC customer</th>
                  {basis === "modem" ? <th className="px-4 py-3">modem_ID</th> : null}
                  {basis === "rate_plan" ? <th className="px-4 py-3">Rate plan</th> : null}
                  <th className="px-4 py-3">CTD MB</th>
                  <th className="px-4 py-3">
                    {basis === "rate_plan" ? "Rate plan allowance MB" : "Modem allowance MB"}
                  </th>
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
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{sim.iccid}</td>
                      <td className="px-4 py-3">{sim.customer ?? "—"}</td>
                      {basis === "modem" ? (
                        <td className="px-4 py-3 font-mono text-xs">{sim.modemId ?? "—"}</td>
                      ) : null}
                      {basis === "rate_plan" ? (
                        <td className="px-4 py-3">{sim.ratePlan ?? "—"}</td>
                      ) : null}
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
                      {basis === "rate_plan"
                        ? "No SIMs match. Set rate plan allowances, then Sync / enrich CTD."
                        : "No SIMs match. Modem allowances are set by ATN; Sync / enrich CTD if usage is empty."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="mt-6 rounded-card border border-line bg-panel px-4 py-5 text-sm text-quiet">
          Per-SIM allowance usage is available to platform and reseller admins.
        </p>
      )}

      {can(ctx.role, "audit.view") ? (
        <div className="mt-8">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
            <Link href="/dashboard/logs" className="text-xs text-accent hover:underline">
              View all logs
            </Link>
          </div>
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
      ) : null}
    </div>
  );
}
