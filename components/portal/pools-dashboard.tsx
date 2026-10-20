"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ModemAllowancesDialog } from "@/components/portal/modem-allowances-dialog";
import { RatePlanAllowancesDialog } from "@/components/portal/rate-plan-allowances-dialog";

export type PoolGroupBy = "rate_plan" | "modem" | "customer";

export type PoolLatestRow = {
  name: string;
  day: string;
  ctdUsageMb: number;
  allowanceMb: number;
  modemCount: number;
  simCount: number;
  pct: number;
  customer?: string | null;
};

export type PoolSeriesPoint = {
  name: string;
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

function topByUsage(rows: PoolLatestRow[], n: number): string[] {
  return [...rows]
    .sort((a, b) => b.ctdUsageMb - a.ctdUsageMb)
    .slice(0, n)
    .map((row) => row.name);
}

function colorFor(name: string, plotted: string[]): string {
  const idx = plotted.indexOf(name);
  return PLOT_COLORS[idx >= 0 ? idx % PLOT_COLORS.length : 0];
}

function EntityPickerDialog({
  open,
  rows,
  selected,
  entityLabel,
  onClose,
  onApply,
}: {
  open: boolean;
  rows: PoolLatestRow[];
  selected: string[];
  entityLabel: string;
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

  const sorted = [...rows].sort((a, b) => b.ctdUsageMb - a.ctdUsageMb);
  const filtered = sorted.filter((row) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return row.name.toLowerCase().includes(needle);
  });

  function toggle(name: string) {
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-card border border-line bg-panel shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{entityLabel}s on chart</h2>
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
            placeholder={`Filter ${entityLabel.toLowerCase()}`}
            className="h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          <ul className="space-y-1">
            {filtered.map((row, index) => {
              const checked = draft.has(row.name);
              return (
                <li key={row.name}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2 hover:border-accent">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(row.name)}
                      className="accent-(--accent,#2dd4bf)"
                    />
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background: checked ? colorFor(row.name, [...draft]) : "transparent",
                        outline: checked ? undefined : "1px solid var(--line, #334155)",
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
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
            onClick={() => setDraft(new Set(topByUsage(rows, 10)))}
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
                const ordered = sorted.map((row) => row.name).filter((name) => draft.has(name));
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

function formatMbShort(mb: number): string {
  if (mb >= 1_000_000) return `${(mb / 1_000_000).toFixed(1)}M`;
  if (mb >= 1000) return `${Math.round(mb / 1000)}k`;
  return `${Math.round(mb)}`;
}

function MultiEntityChart({
  plotted,
  seriesByName,
  latestByName,
  busy,
  allowPick,
  entityLabel,
  title = "CTD usage over time",
  subtitle,
  onOpenPicker,
}: {
  plotted: string[];
  seriesByName: Map<string, PoolSeriesPoint[]>;
  latestByName: Map<string, PoolLatestRow>;
  busy: boolean;
  allowPick: boolean;
  entityLabel: string;
  title?: string;
  subtitle?: string;
  onOpenPicker: () => void;
}) {
  const [hover, setHover] = useState<{
    name: string;
    day: string;
    ctdUsageMb: number;
    allowanceMb: number;
    pct: number;
    color: string;
    clientX: number;
    clientY: number;
  } | null>(null);

  const days = useMemo(() => {
    const set = new Set<string>();
    for (const name of plotted) {
      for (const point of seriesByName.get(name) ?? []) set.add(point.day);
    }
    return [...set].sort();
  }, [plotted, seriesByName]);

  // Scale to CTD only so large allowances don't squash the usage lines.
  const maxMb = useMemo(() => {
    let max = 1;
    for (const name of plotted) {
      for (const point of seriesByName.get(name) ?? []) {
        max = Math.max(max, point.ctdUsageMb);
      }
    }
    return max * 1.12;
  }, [plotted, seriesByName]);

  const width = 720;
  const height = 280;
  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 32;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  function xAt(i: number) {
    if (days.length <= 1) return padL + innerW / 2;
    return padL + (i / (days.length - 1)) * innerW;
  }

  function yAt(mb: number) {
    const clamped = Math.min(Math.max(mb, 0), maxMb);
    return padT + innerH - (clamped / maxMb) * innerH;
  }

  const hint =
    subtitle ??
    `Sydney day · solid CTD · dashed allowance (hover a point)${
      allowPick ? ` · top 10 ${entityLabel.toLowerCase()}s` : ""
    }${days.length === 1 ? " · lines from day 2" : ""}`;

  return (
    <article className="flex h-full flex-col rounded-card border border-line bg-panel p-4 sm:p-5">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <h2 className="text-base font-semibold text-ink sm:text-lg">{title}</h2>
          <p className="mt-1 text-[11px] leading-snug text-quiet">
            {hint}
            {busy ? " · loading…" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allowPick ? (
            <button
              type="button"
              onClick={onOpenPicker}
              className="rounded-card border border-line px-3 py-1.5 text-xs hover:border-accent sm:text-sm"
            >
              Add {entityLabel.toLowerCase()}s
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative mt-3 min-h-0 flex-1">
        {plotted.length === 0 || days.length === 0 ? (
          <p className="flex h-64 items-center text-sm text-quiet">
            {allowPick
              ? `No daily points yet — open Pools or wait for the daily snapshot, then add ${entityLabel.toLowerCase()}s.`
              : "No daily points yet — saved after Sydney midnight / first open."}
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-64 w-full sm:h-72"
            role="img"
            onMouseLeave={() => setHover(null)}
          >
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
                  <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-quiet text-[9px]">
                    {t === 0 ? "0" : formatMbShort(maxMb * t)}
                  </text>
                </g>
              );
            })}
            {days.map((day, i) => {
              const step = days.length > 14 ? Math.ceil(days.length / 10) : 1;
              const show = i === 0 || i === days.length - 1 || i % step === 0;
              if (!show) return null;
              return (
                <text
                  key={day}
                  x={xAt(i)}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-quiet text-[9px]"
                >
                  {day.slice(5)}
                </text>
              );
            })}
            {plotted.map((name) => {
              const points = seriesByName.get(name) ?? [];
              const byDay = new Map(points.map((p) => [p.day, p]));
              const color = colorFor(name, plotted);
              const active = hover?.name === name;
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
                <g key={name} opacity={hover && !active ? 0.28 : 1}>
                  {allowPath ? (
                    <path
                      d={allowPath}
                      fill="none"
                      stroke={color}
                      strokeWidth={active ? 2 : 1.25}
                      strokeDasharray="4 3"
                      strokeOpacity={active ? 0.85 : 0.4}
                      pointerEvents="none"
                    />
                  ) : null}
                  {ctdPath ? (
                    <path
                      d={ctdPath}
                      fill="none"
                      stroke={color}
                      strokeWidth={active ? 3 : 2.25}
                      strokeLinecap="round"
                      pointerEvents="none"
                    />
                  ) : null}
                  {days.map((day, i) => {
                    const p = byDay.get(day);
                    if (!p) return null;
                    const latest = latestByName.get(name);
                    const pct =
                      latest?.pct ??
                      (p.allowanceMb > 0 ? Math.round((p.ctdUsageMb / p.allowanceMb) * 100) : 0);
                    return (
                      <circle
                        key={`${name}-${day}`}
                        cx={xAt(i)}
                        cy={yAt(p.ctdUsageMb)}
                        r={active ? 5 : 3.5}
                        fill={color}
                        className="cursor-pointer"
                        onMouseEnter={(event) => {
                          setHover({
                            name,
                            day,
                            ctdUsageMb: p.ctdUsageMb,
                            allowanceMb: p.allowanceMb,
                            pct,
                            color,
                            clientX: event.clientX,
                            clientY: event.clientY,
                          });
                        }}
                        onMouseMove={(event) => {
                          setHover((current) =>
                            current && current.name === name && current.day === day
                              ? { ...current, clientX: event.clientX, clientY: event.clientY }
                              : current,
                          );
                        }}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>
        )}

        {hover ? (
          <div
            className="pointer-events-none fixed z-50 min-w-40 rounded-xl border border-line bg-panel px-3 py-2 shadow-xl"
            style={{ left: hover.clientX + 12, top: hover.clientY + 12 }}
          >
            <p className="flex items-center gap-1.5 font-mono text-xs font-medium text-ink">
              <span className="h-2 w-2 rounded-full" style={{ background: hover.color }} />
              {hover.name}
            </p>
            <p className="mt-1 text-[11px] text-quiet">{hover.day}</p>
            <p className="mt-1 text-xs text-ink">
              CTD {hover.ctdUsageMb.toLocaleString("en-AU", { maximumFractionDigits: 0 })} MB
            </p>
            <p className="text-xs text-quiet">
              Cap {hover.allowanceMb.toLocaleString("en-AU", { maximumFractionDigits: 0 })} MB ·{" "}
              {hover.pct}%
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function PoolsDashboard({
  initialRows,
  canEdit,
  scopedCustomer = null,
  platformView = true,
  groupBy = "modem",
  mode = "full",
}: {
  initialRows: PoolLatestRow[];
  canEdit: boolean;
  scopedCustomer?: string | null;
  platformView?: boolean;
  /** Pools plot groups by modem_ID (customer SIM groups). */
  groupBy?: PoolGroupBy;
  /** `chart` = embeddable CTD plot only (e.g. Dashboard). */
  mode?: "full" | "chart";
}) {
  const entityLabel =
    groupBy === "rate_plan" ? "Rate plan" : groupBy === "modem" ? "modem_ID" : "CC customer";
  const allowanceLabel =
    groupBy === "rate_plan" ? "Rate plan allowance MB" : "Modem allowance MB";
  const [filterQ, setFilterQ] = useState("");
  const [plotted, setPlotted] = useState<string[]>(() => topByUsage(initialRows, 10));
  const [series, setSeries] = useState<PoolSeriesPoint[]>([]);
  const [seriesBusy, setSeriesBusy] = useState(false);
  const [modemAllowancesOpen, setModemAllowancesOpen] = useState(false);
  const [ratePlanAllowancesOpen, setRatePlanAllowancesOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [message, setMessage] = useState("");

  const latestByName = useMemo(() => {
    const map = new Map<string, PoolLatestRow>();
    for (const row of initialRows) map.set(row.name, row);
    return map;
  }, [initialRows]);

  const seriesByName = useMemo(() => {
    const map = new Map<string, PoolSeriesPoint[]>();
    for (const point of series) {
      const list = map.get(point.name) ?? [];
      list.push(point);
      map.set(point.name, list);
    }
    return map;
  }, [series]);

  const loadSeries = useCallback(async (names: string[]) => {
    if (names.length === 0) {
      setSeries([]);
      return;
    }
    setSeriesBusy(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/portal/pools?view=series&keys=${encodeURIComponent(names.join(","))}`,
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
    const q = filterQ.trim().toLowerCase();
    const rows = [...initialRows].sort((a, b) => b.ctdUsageMb - a.ctdUsageMb);
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.customer ?? "").toLowerCase().includes(q),
    );
  }, [filterQ, initialRows]);

  function addToPlot(name: string) {
    setPlotted((current) => (current.includes(name) ? current : [...current, name]));
  }

  const chart = (
    <MultiEntityChart
      plotted={plotted}
      seriesByName={seriesByName}
      latestByName={latestByName}
      busy={seriesBusy}
      allowPick
      entityLabel={entityLabel}
      title={mode === "chart" ? "Data usage by modem_ID" : "CTD usage over time"}
      subtitle={
        mode === "chart"
          ? "Same plot as Pools · top 10 by CTD · hover a point for details"
          : undefined
      }
      onOpenPicker={() => setPickerOpen(true)}
    />
  );

  const picker = (
    <EntityPickerDialog
      open={pickerOpen}
      rows={initialRows}
      selected={plotted}
      entityLabel={entityLabel}
      onClose={() => setPickerOpen(false)}
      onApply={setPlotted}
    />
  );

  if (mode === "chart") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {message ? <p className="mb-3 shrink-0 text-sm text-quiet">{message}</p> : null}
        <div className="min-h-0 flex-1">{chart}</div>
        {picker}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Pools</h1>
          <p className="mt-1 text-sm text-quiet">
            {groupBy === "modem" && platformView
              ? "Grouped by customer modem_ID: daily Σ CTD MB and Σ modem_ID allowance across SIMs with that ID (one point per Sydney calendar day)."
              : groupBy === "modem" && scopedCustomer
                ? `Grouped by modem_ID for CC customer “${scopedCustomer}”: daily Σ CTD MB and Σ modem_ID allowance across SIMs with that ID (one point per Sydney calendar day).`
                : groupBy === "modem"
                  ? "This organisation is not bound to a Control Center customer yet. Sell stock / bind first to see modem_ID pools."
                  : groupBy === "rate_plan"
                    ? "Grouped by Jasper/CC rate plan: daily Σ CTD MB and Σ rate plan allowance across SIMs on that plan (one point per Sydney calendar day)."
                    : scopedCustomer
                      ? `Your organisation’s Control Center customer “${scopedCustomer}”: daily CTD MB and modem_ID allowance (one point per Sydney calendar day, auto-saved).`
                      : "This organisation is not bound to a Control Center customer yet. Sell stock / bind first to see pool usage."}
          </p>
        </div>
        {canEdit && platformView ? (
          <div className="flex flex-wrap gap-2">
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
          </div>
        ) : null}
      </div>

      {message ? <p className="mt-3 text-sm text-quiet">{message}</p> : null}

      <div className="mt-6">{chart}</div>

      <form
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <input
          value={filterQ}
          onChange={(event) => setFilterQ(event.target.value)}
          placeholder={
            groupBy === "modem"
              ? "Filter modem_ID or customer"
              : `Filter ${entityLabel.toLowerCase()}`
          }
          className="h-10 w-full max-w-md rounded-full border border-line bg-panel px-4 text-sm outline-none focus:border-accent"
        />
      </form>

      <div className="mt-4 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="text-quiet">
            <tr>
              {groupBy === "modem" ? <th className="px-4 py-3">Customer</th> : null}
              <th className="px-4 py-3">{entityLabel}</th>
              <th className="px-4 py-3">Day</th>
              <th className="px-4 py-3">CTD MB</th>
              <th className="px-4 py-3">{allowanceLabel}</th>
              <th className="px-4 py-3">%</th>
              <th className="px-4 py-3">SIMs</th>
              <th className="px-4 py-3">Chart</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const onChart = plotted.includes(row.name);
              return (
                <tr key={row.name} className="border-t border-line hover:bg-panel-2">
                  {groupBy === "modem" ? (
                    <td className="px-4 py-3 text-quiet">{row.customer || "—"}</td>
                  ) : null}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      {onChart ? (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: colorFor(row.name, plotted) }}
                        />
                      ) : null}
                      <span className="font-mono text-xs">{row.name}</span>
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
                  <td className="px-4 py-3">{row.simCount}</td>
                  <td className="px-4 py-3">
                    {onChart ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPlotted((current) => current.filter((c) => c !== row.name))
                        }
                        className="text-sm text-quiet hover:text-ink"
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => addToPlot(row.name)}
                        className="text-sm text-accent"
                      >
                        Add
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {picker}
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
        </>
      ) : null}
    </div>
  );
}
