"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ModemAllowancesDialog } from "@/components/portal/modem-allowances-dialog";
import { RatePlanAllowancesDialog } from "@/components/portal/rate-plan-allowances-dialog";

type PoolAllowanceBasis = "rate_plan" | "modem";

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

const PLOT_COLORS = [
  "#2dd4bf",
  "#60a5fa",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#34d399",
  "#fb7185",
  "#38bdf8",
  "#c084fc",
  "#facc15",
  "#4ade80",
  "#e879f9",
];

function topCustomersByUsage(rows: PoolLatestRow[], n: number): string[] {
  return [...rows]
    .sort((a, b) => b.ctdUsageMb - a.ctdUsageMb)
    .slice(0, n)
    .map((row) => row.customer);
}

function colorFor(customer: string, plotted: string[]): string {
  const idx = plotted.indexOf(customer);
  return PLOT_COLORS[idx >= 0 ? idx % PLOT_COLORS.length : 0];
}

function CustomerPickerDialog({
  open,
  customers,
  selected,
  onClose,
  onApply,
}: {
  open: boolean;
  customers: PoolLatestRow[];
  selected: string[];
  onClose: () => void;
  onApply: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(new Set(selected));
  const [q, setQ] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(new Set(selected));
      setQ("");
    }
  }, [open, selected]);

  if (!open) return null;

  const sorted = [...customers].sort((a, b) => b.ctdUsageMb - a.ctdUsageMb);
  const filtered = sorted.filter((row) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return row.customer.toLowerCase().includes(needle);
  });

  function toggle(customer: string) {
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(customer)) next.delete(customer);
      else next.add(customer);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-card border border-line bg-panel shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Customers on chart</h2>
            <p className="mt-1 text-sm text-quiet">
              Default is top 10 by CTD usage. Tick more to add them to the plot.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-quiet hover:text-ink">
            Close
          </button>
        </div>
        <div className="border-b border-line px-5 py-3">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Filter CC customer"
            className="h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          <ul className="space-y-1">
            {filtered.map((row, index) => {
              const checked = draft.has(row.customer);
              return (
                <li key={row.customer}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2 hover:border-accent">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(row.customer)}
                      className="accent-(--accent,#2dd4bf)"
                    />
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background: checked
                          ? colorFor(row.customer, [...draft])
                          : "transparent",
                        outline: checked ? undefined : "1px solid var(--line, #334155)",
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{row.customer}</span>
                    <span className="shrink-0 text-xs text-quiet">
                      {index < 10 && !q ? "top 10 · " : ""}
                      {row.ctdUsageMb.toLocaleString("en-AU", { maximumFractionDigits: 0 })} MB
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={() => setDraft(new Set(topCustomersByUsage(customers, 10)))}
            className="text-sm text-accent"
          >
            Reset to top 10
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const ordered = sorted
                  .map((row) => row.customer)
                  .filter((name) => draft.has(name));
                onApply(ordered);
                onClose();
              }}
              className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
            >
              Apply ({draft.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MultiCustomerChart({
  plotted,
  seriesByCustomer,
  latestByCustomer,
  busy,
  allowCustomerPick,
  onRemove,
  onOpenPicker,
}: {
  plotted: string[];
  seriesByCustomer: Map<string, PoolSeriesPoint[]>;
  latestByCustomer: Map<string, PoolLatestRow>;
  busy: boolean;
  allowCustomerPick: boolean;
  onRemove: (customer: string) => void;
  onOpenPicker: () => void;
}) {
  const days = useMemo(() => {
    const set = new Set<string>();
    for (const customer of plotted) {
      for (const point of seriesByCustomer.get(customer) ?? []) set.add(point.day);
    }
    return [...set].sort();
  }, [plotted, seriesByCustomer]);

  const maxMb = useMemo(() => {
    let max = 1;
    for (const customer of plotted) {
      for (const point of seriesByCustomer.get(customer) ?? []) {
        max = Math.max(max, point.ctdUsageMb, point.allowanceMb);
      }
    }
    return max;
  }, [plotted, seriesByCustomer]);

  const width = 640;
  const height = 220;
  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  function xAt(i: number) {
    if (days.length <= 1) return padL + innerW / 2;
    return padL + (i / (days.length - 1)) * innerW;
  }

  function yAt(mb: number) {
    return padT + innerH - (mb / maxMb) * innerH;
  }

  return (
    <article className="rounded-card border border-line bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">CTD usage over time</h2>
          <p className="mt-1 text-xs text-quiet">
            Solid = CTD MB (cycle-to-date). Dashed = allowance
            {allowCustomerPick ? ". Top 10 by usage by default." : "."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {busy ? <span className="text-xs text-quiet">Loading…</span> : null}
          {allowCustomerPick ? (
            <button
              type="button"
              onClick={onOpenPicker}
              className="rounded-card border border-line px-3 py-1.5 text-sm hover:border-accent"
            >
              Add customers
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        {plotted.length === 0 || days.length === 0 ? (
          <p className="flex h-48 items-center text-sm text-quiet">
            {allowCustomerPick
              ? "No series to plot. Snapshot today, then pick customers."
              : "No series to plot. Run Snapshot today after Sync."}
          </p>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full min-w-100" role="img">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = padT + innerH * (1 - t);
              return (
                <g key={t}>
                  <line
                    x1={padL}
                    x2={width - padR}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    className="text-line"
                    strokeOpacity={0.35}
                  />
                  <text
                    x={padL - 6}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-quiet text-[9px]"
                  >
                    {t === 0 ? "0" : `${Math.round((maxMb * t) / 1000)}k`}
                  </text>
                </g>
              );
            })}
            {days.map((day, i) => (
              <text
                key={day}
                x={xAt(i)}
                y={height - 8}
                textAnchor="middle"
                className="fill-quiet text-[9px]"
              >
                {day.slice(5)}
              </text>
            ))}
            {plotted.map((customer) => {
              const points = seriesByCustomer.get(customer) ?? [];
              const byDay = new Map(points.map((p) => [p.day, p]));
              const color = colorFor(customer, plotted);
              const buildPath = (value: (p: PoolSeriesPoint) => number) => {
                let d = "";
                let move = true;
                days.forEach((day, i) => {
                  const p = byDay.get(day);
                  if (!p) {
                    move = true;
                    return;
                  }
                  d += `${move ? "M" : "L"}${xAt(i)},${yAt(value(p))} `;
                  move = false;
                });
                return d.trim();
              };
              const ctdPath = buildPath((p) => p.ctdUsageMb);
              const allowPath = buildPath((p) => p.allowanceMb);
              return (
                <g key={customer}>
                  {allowPath ? (
                    <path
                      d={allowPath}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      strokeOpacity={0.55}
                    />
                  ) : null}
                  {ctdPath ? (
                    <path d={ctdPath} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" />
                  ) : null}
                  {days.map((day, i) => {
                    const p = byDay.get(day);
                    if (!p) return null;
                    return (
                      <circle
                        key={`${customer}-${day}`}
                        cx={xAt(i)}
                        cy={yAt(p.ctdUsageMb)}
                        r={3}
                        fill={color}
                      >
                        <title>
                          {customer}: {p.ctdUsageMb.toFixed(0)} MB CTD / {p.allowanceMb.toFixed(0)} MB
                          allowance ({day})
                        </title>
                      </circle>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-quiet">Legend</p>
          <p className="text-[11px] text-quiet">
            <span className="mr-3 inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded bg-ink" /> CTD
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-px w-4 border-t border-dashed border-ink" /> Allowance
            </span>
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {plotted.map((customer) => {
            const latest = latestByCustomer.get(customer);
            const color = colorFor(customer, plotted);
            return (
              <li
                key={customer}
                className="flex max-w-full items-center gap-2 rounded-full border border-line bg-canvas/60 py-1 pl-2.5 pr-1.5"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate text-xs font-medium">{customer}</span>
                {latest ? (
                  <span className="hidden shrink-0 text-[10px] text-quiet sm:inline">
                    {latest.ctdUsageMb.toLocaleString("en-AU", { maximumFractionDigits: 0 })} MB ·{" "}
                    {latest.pct}%
                  </span>
                ) : null}
                {allowCustomerPick ? (
                  <button
                    type="button"
                    onClick={() => onRemove(customer)}
                    className="rounded-full px-1.5 text-xs text-quiet hover:bg-panel-2 hover:text-ink"
                    aria-label={`Remove ${customer} from chart`}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            );
          })}
          {plotted.length === 0 ? (
            <li className="text-xs text-quiet">No customers selected.</li>
          ) : null}
        </ul>
      </div>
    </article>
  );
}

export function PoolsDashboard({
  initialCustomers,
  canEdit,
  scopedCustomer = null,
  platformView = true,
  basis = "modem",
}: {
  initialCustomers: PoolLatestRow[];
  canEdit: boolean;
  /** When set, reseller is limited to this Jasper/CC customer. */
  scopedCustomer?: string | null;
  platformView?: boolean;
  /** Super admin → rate_plan; reseller → modem. Mapping UI is super-admin only. */
  basis?: PoolAllowanceBasis;
}) {
  const [customerQ, setCustomerQ] = useState("");
  const [plotted, setPlotted] = useState<string[]>(() => topCustomersByUsage(initialCustomers, 10));
  const [series, setSeries] = useState<PoolSeriesPoint[]>([]);
  const [seriesBusy, setSeriesBusy] = useState(false);
  const [modemAllowancesOpen, setModemAllowancesOpen] = useState(false);
  const [ratePlanAllowancesOpen, setRatePlanAllowancesOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [snapBusy, setSnapBusy] = useState(false);
  const [message, setMessage] = useState("");
  const allowanceLabel = basis === "rate_plan" ? "Rate plan allowance MB" : "Modem allowance MB";

  const latestByCustomer = useMemo(() => {
    const map = new Map<string, PoolLatestRow>();
    for (const row of initialCustomers) map.set(row.customer, row);
    return map;
  }, [initialCustomers]);

  const seriesByCustomer = useMemo(() => {
    const map = new Map<string, PoolSeriesPoint[]>();
    for (const point of series) {
      const list = map.get(point.customer) ?? [];
      list.push(point);
      map.set(point.customer, list);
    }
    return map;
  }, [series]);

  const loadSeries = useCallback(async (customers: string[]) => {
    if (customers.length === 0) {
      setSeries([]);
      return;
    }
    setSeriesBusy(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/portal/pools?view=series&customers=${encodeURIComponent(customers.join(","))}`,
      );
      const data = (await res.json()) as { series?: PoolSeriesPoint[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load series.");
      setSeries(data.series ?? []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load series.");
      setSeries([]);
    } finally {
      setSeriesBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadSeries(plotted);
  }, [plotted, loadSeries]);

  const filtered = useMemo(() => {
    const q = customerQ.trim().toLowerCase();
    const rows = [...initialCustomers].sort((a, b) => b.ctdUsageMb - a.ctdUsageMb);
    if (!q) return rows;
    return rows.filter((row) => row.customer.toLowerCase().includes(q));
  }, [customerQ, initialCustomers]);

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

  function addToPlot(customer: string) {
    setPlotted((current) => (current.includes(customer) ? current : [...current, customer]));
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Pools</h1>
          <p className="mt-1 text-sm text-quiet">
            {platformView
              ? "Per Jasper/CC customer, summed across SIMs: CTD MB ÷ rate plan allowance (cycle-to-date, snapshotted once per Sydney day). Modem_ID allowances are for reseller view only; both mappings are set here."
              : scopedCustomer
                ? `Your organisation’s Control Center customer “${scopedCustomer}”: CTD MB and modem_ID allowance summed across your SIMs (cycle-to-date, snapshotted once per Sydney day).`
                : "This organisation is not bound to a Control Center customer yet. Sell stock / bind first to see pool usage."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && platformView ? (
            <>
              <button
                type="button"
                onClick={() => setRatePlanAllowancesOpen(true)}
                className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent"
              >
                Rate plan allowances
              </button>
              <button
                type="button"
                onClick={() => setModemAllowancesOpen(true)}
                className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent"
              >
                Modem allowances
              </button>
            </>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              disabled={snapBusy}
              onClick={() => snapshotNow()}
              className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
            >
              {snapBusy ? "Snapshot…" : "Snapshot today"}
            </button>
          ) : null}
        </div>
      </div>

      {message ? <p className="mt-3 text-sm text-quiet">{message}</p> : null}

      <div className="mt-6">
        <MultiCustomerChart
          plotted={plotted}
          seriesByCustomer={seriesByCustomer}
          latestByCustomer={latestByCustomer}
          busy={seriesBusy}
          allowCustomerPick={platformView}
          onRemove={(customer) => setPlotted((current) => current.filter((c) => c !== customer))}
          onOpenPicker={() => setPickerOpen(true)}
        />
      </div>

      {platformView ? (
        <form
          className="mt-6"
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
      ) : null}

      <div className={`overflow-x-auto rounded-card border border-line bg-panel ${platformView ? "mt-4" : "mt-6"}`}>
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="text-quiet">
            <tr>
              <th className="px-4 py-3">CC customer</th>
              <th className="px-4 py-3">Day</th>
              <th className="px-4 py-3">CTD MB</th>
              <th className="px-4 py-3">{allowanceLabel}</th>
              <th className="px-4 py-3">%</th>
              <th className="px-4 py-3">SIMs w/ modem_ID</th>
              <th className="px-4 py-3">SIMs</th>
              {platformView ? <th className="px-4 py-3">Chart</th> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const onChart = plotted.includes(row.customer);
              return (
                <tr key={row.customer} className="border-t border-line hover:bg-panel-2">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      {onChart ? (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: colorFor(row.customer, plotted) }}
                        />
                      ) : null}
                      {row.customer}
                    </span>
                  </td>
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
                  {platformView ? (
                    <td className="px-4 py-3">
                      {onChart ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPlotted((current) => current.filter((c) => c !== row.customer))
                          }
                          className="text-sm text-quiet hover:text-ink"
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToPlot(row.customer)}
                          className="text-sm text-accent"
                        >
                          Add
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {platformView ? (
        <>
          <RatePlanAllowancesDialog
            open={ratePlanAllowancesOpen}
            onClose={() => setRatePlanAllowancesOpen(false)}
          />
          <ModemAllowancesDialog
            open={modemAllowancesOpen}
            onClose={() => setModemAllowancesOpen(false)}
          />
          <CustomerPickerDialog
            open={pickerOpen}
            customers={initialCustomers}
            selected={plotted}
            onClose={() => setPickerOpen(false)}
            onApply={setPlotted}
          />
        </>
      ) : null}
    </div>
  );
}
