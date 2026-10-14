"use client";

import { useEffect, useMemo, useState } from "react";
import { ModemAllowancesDialog } from "@/components/portal/modem-allowances-dialog";

export type PoolLatestRow = {
  customer: string;
  day: string;
  ctdUsageMb: number;
  allowanceMb: number;
  modemCount: number;
  simCount: number;
  pct: number;
};

export type PoolSeriesPoint = {
  customer: string;
  day: string;
  ctdUsageMb: number;
  allowanceMb: number;
};

export function PoolsDashboard({
  initialCustomers,
  canEdit,
}: {
  initialCustomers: PoolLatestRow[];
  canEdit: boolean;
}) {
  const [customerQ, setCustomerQ] = useState("");
  const [selected, setSelected] = useState<string | null>(initialCustomers[0]?.customer ?? null);
  const [series, setSeries] = useState<PoolSeriesPoint[]>([]);
  const [seriesBusy, setSeriesBusy] = useState(false);
  const [allowancesOpen, setAllowancesOpen] = useState(false);
  const [snapBusy, setSnapBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (initialCustomers[0]?.customer) {
      void loadSeries(initialCustomers[0].customer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const filtered = useMemo(() => {
    const q = customerQ.trim().toLowerCase();
    if (!q) return initialCustomers;
    return initialCustomers.filter((row) => row.customer.toLowerCase().includes(q));
  }, [customerQ, initialCustomers]);

  async function loadSeries(customer: string) {
    setSelected(customer);
    setSeriesBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/portal/pools?view=series&customer=${encodeURIComponent(customer)}`);
      const data = (await res.json()) as { series?: PoolSeriesPoint[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load series.");
      setSeries(data.series ?? []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load series.");
      setSeries([]);
    } finally {
      setSeriesBusy(false);
    }
  }

  async function snapshotNow() {
    setSnapBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/portal/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as { customers?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Snapshot failed.");
      setMessage(`Snapshot saved for ${data.customers ?? 0} CC customers. Refresh to see the table.`);
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Snapshot failed.");
    } finally {
      setSnapBusy(false);
    }
  }

  const maxMb = Math.max(...series.flatMap((p) => [p.ctdUsageMb, p.allowanceMb]), 1);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Pools</h1>
          <p className="mt-1 text-sm text-quiet">
            Per Jasper/CC customer, summed across SIMs: CTD MB per SIM, and manual modem_ID allowance
            applied per SIM (cycle-to-date, snapshotted once per Sydney day).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={() => setAllowancesOpen(true)}
                className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent"
              >
                Modem allowances
              </button>
              <button
                type="button"
                disabled={snapBusy}
                onClick={() => snapshotNow()}
                className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
              >
                {snapBusy ? "Snapshot…" : "Snapshot today"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {message ? <p className="mt-3 text-sm text-quiet">{message}</p> : null}

      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <input
          value={customerQ}
          onChange={(event) => setCustomerQ(event.target.value)}
          placeholder="Filter CC customer"
          className="h-10 w-full max-w-md rounded-full border border-line bg-panel px-4 text-sm outline-none focus:border-accent"
        />
      </form>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <article className="rounded-card border border-line bg-panel p-5 lg:col-span-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold">{selected ?? "Select a customer"}</h2>
              <p className="mt-1 text-xs text-quiet">
                CTD (solid) vs allowance (outline) — not daily deltas.
              </p>
            </div>
            {seriesBusy ? <p className="text-xs text-quiet">Loading…</p> : null}
          </div>
          <div className="mt-4 flex h-48 items-end gap-1">
            {series.length === 0 ? (
              <p className="text-sm text-quiet">
                {selected
                  ? "No daily snapshots yet. Run Snapshot today after Sync."
                  : "Pick a customer in the table."}
              </p>
            ) : (
              series.map((point) => (
                <div key={point.day} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <div className="relative flex w-full flex-1 items-end justify-center">
                    <div
                      className="absolute bottom-0 w-[40%] rounded-t border border-accent/50"
                      style={{ height: `${Math.max(4, (point.allowanceMb / maxMb) * 100)}%` }}
                      title={`Allowance ${point.allowanceMb.toFixed(0)} MB`}
                    />
                    <div
                      className="relative z-10 w-[40%] rounded-t bg-accent/80"
                      style={{ height: `${Math.max(4, (point.ctdUsageMb / maxMb) * 100)}%` }}
                      title={`CTD ${point.ctdUsageMb.toFixed(0)} MB`}
                    />
                  </div>
                  <span className="text-[9px] text-quiet">{point.day.slice(5)}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-card border border-line bg-panel p-5 lg:col-span-2">
          <h2 className="font-semibold">As-of latest day</h2>
          <ul className="mt-3 max-h-64 space-y-2 overflow-auto text-sm">
            {filtered.map((row) => {
              const alert = row.pct >= 100 ? "text-danger" : row.pct >= 80 ? "text-warn" : "text-ok";
              const active = row.customer === selected;
              return (
                <li key={row.customer}>
                  <button
                    type="button"
                    onClick={() => loadSeries(row.customer)}
                    className={`w-full rounded-xl border px-3 py-2 text-left ${
                      active ? "border-accent bg-panel-2" : "border-line hover:border-accent"
                    }`}
                  >
                    <p className="truncate font-medium">{row.customer}</p>
                    <p className="mt-1 text-xs text-quiet">
                      {row.day} · {row.modemCount} SIMs w/ modem_ID · {row.simCount} SIMs
                    </p>
                    <p className={`mt-1 ${alert}`}>
                      {row.ctdUsageMb.toLocaleString("en-AU", { maximumFractionDigits: 0 })} /{" "}
                      {row.allowanceMb.toLocaleString("en-AU", { maximumFractionDigits: 0 })} MB ·{" "}
                      {row.pct}%
                    </p>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 ? (
              <li className="py-6 text-quiet">No snapshots yet. Set modem allowances, then Snapshot today.</li>
            ) : null}
          </ul>
        </article>
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="text-quiet">
            <tr>
              <th className="px-4 py-3">CC customer</th>
              <th className="px-4 py-3">Day</th>
              <th className="px-4 py-3">CTD MB</th>
              <th className="px-4 py-3">Allowance MB</th>
              <th className="px-4 py-3">%</th>
              <th className="px-4 py-3">SIMs w/ modem_ID</th>
              <th className="px-4 py-3">SIMs</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.customer}
                className="cursor-pointer border-t border-line hover:bg-panel-2"
                onClick={() => loadSeries(row.customer)}
              >
                <td className="px-4 py-3">{row.customer}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.day}</td>
                <td className="px-4 py-3">
                  {row.ctdUsageMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}
                </td>
                <td className="px-4 py-3">
                  {row.allowanceMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}
                </td>
                <td
                  className={`px-4 py-3 ${
                    row.pct >= 100 ? "text-danger" : row.pct >= 80 ? "text-warn" : "text-ok"
                  }`}
                >
                  {row.pct}%
                </td>
                <td className="px-4 py-3">{row.modemCount}</td>
                <td className="px-4 py-3">{row.simCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ModemAllowancesDialog open={allowancesOpen} onClose={() => setAllowancesOpen(false)} />
    </div>
  );
}
