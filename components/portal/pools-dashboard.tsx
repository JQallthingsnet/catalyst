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

function MultiEntityChart({
  plotted,
  seriesByName,
  latestByName,
  busy,
  allowPick,
  entityLabel,
  onRemove,
  onOpenPicker,
}: {
  plotted: string[];
  seriesByName: Map<string, PoolSeriesPoint[]>;
  latestByName: Map<string, PoolLatestRow>;
  busy: boolean;
  allowPick: boolean;
  entityLabel: string;
  onRemove: (name: string) => void;
  onOpenPicker: () => void;
}) {
  const days = useMemo(() => {
    const set = new Set<string>();
    for (const name of plotted) {
      for (const point of seriesByName.get(name) ?? []) set.add(point.day);
    }
    return [...set].sort();
  }, [plotted, seriesByName]);

  const maxMb = useMemo(() => {
    let max = 1;
    for (const name of plotted) {
      for (const point of seriesByName.get(name) ?? []) {
        max = Math.max(max, point.ctdUsageMb, point.allowanceMb);
      }
    }
    return max;
  }, [plotted, seriesByName]);

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
            X-axis = Sydney calendar day. One point saved automatically each day (cron / first open).
            Solid = CTD MB · Dashed = allowance
            {allowPick ? `. Top 10 ${entityLabel.toLowerCase()}s by usage by default.` : "."}
            {days.length === 1 ? " Lines appear from day 2 onward." : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {busy ? <span className="text-xs text-quiet">Loading…</span> : null}
          {allowPick ? (
            <button
              type="button"
              onClick={onOpenPicker}
              className="rounded-card border border-line px-3 py-1.5 text-sm hover:border-accent"
            >
              Add {entityLabel.toLowerCase()}s
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        {plotted.length === 0 || days.length === 0 ? (
          <p className="flex h-48 items-center text-sm text-quiet">
            {allowPick
              ? `No daily points yet. Today is saved on first open or cron after Sydney midnight — then pick ${entityLabel.toLowerCase()}s.`
              : "No daily points yet. Today is saved automatically after Sydney midnight / first open."}
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
                  <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-quiet text-[9px]">
                    {t === 0 ? "0" : `${Math.round((maxMb * t) / 1000)}k`}
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
                  y={height - 8}
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
                <g key={name}>
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
                    <path
                      d={ctdPath}
                      fill="none"
                      stroke={color}
                      strokeWidth={2.25}
                      strokeLinecap="round"
                    />
                  ) : null}
                  {days.map((day, i) => {
                    const p = byDay.get(day);
                    if (!p) return null;
                    return (
                      <circle
                        key={`${name}-${day}`}
                        cx={xAt(i)}
                        cy={yAt(p.ctdUsageMb)}
                        r={3}
                        fill={color}
                      >
                        <title>
                          {name}: {p.ctdUsageMb.toFixed(0)} MB CTD / {p.allowanceMb.toFixed(0)} MB
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
          {plotted.map((name) => {
            const latest = latestByName.get(name);
            const color = colorFor(name, plotted);
            return (
              <li
                key={name}
                className="flex max-w-full items-center gap-2 rounded-full border border-line bg-canvas/60 py-1 pl-2.5 pr-1.5"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate text-xs font-medium">{name}</span>
                {latest ? (
                  <span className="hidden shrink-0 text-[10px] text-quiet sm:inline">
                    {latest.ctdUsageMb.toLocaleString("en-AU", { maximumFractionDigits: 0 })} MB ·{" "}
                    {latest.pct}%
                  </span>
                ) : null}
                {allowPick ? (
                  <button
                    type="button"
                    onClick={() => onRemove(name)}
                    className="rounded-full px-1.5 text-xs text-quiet hover:bg-panel-2 hover:text-ink"
                    aria-label={`Remove ${name} from chart`}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            );
          })}
          {plotted.length === 0 ? (
            <li className="text-xs text-quiet">No {entityLabel.toLowerCase()}s selected.</li>
          ) : null}
        </ul>
      </div>
    </article>
  );
}

export function PoolsDashboard({
  initialRows,
  canEdit,
  scopedCustomer = null,
  platformView = true,
  groupBy = "customer",
}: {
  initialRows: PoolLatestRow[];
  canEdit: boolean;
  scopedCustomer?: string | null;
  platformView?: boolean;
  /** Super admin → rate_plan; reseller → modem. */
  groupBy?: PoolGroupBy;
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
    return rows.filter((row) => row.name.toLowerCase().includes(q));
  }, [filterQ, initialRows]);

  function addToPlot(name: string) {
    setPlotted((current) => (current.includes(name) ? current : [...current, name]));
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Pools</h1>
          <p className="mt-1 text-sm text-quiet">
            {groupBy === "rate_plan"
              ? "Grouped by Jasper/CC rate plan: daily Σ CTD MB and Σ rate plan allowance across SIMs on that plan (one point per Sydney calendar day)."
              : groupBy === "modem" && scopedCustomer
                ? `Grouped by modem_ID for CC customer “${scopedCustomer}”: daily Σ CTD MB and Σ modem_ID allowance across SIMs with that ID (one point per Sydney calendar day).`
                : groupBy === "modem"
                  ? "This organisation is not bound to a Control Center customer yet. Sell stock / bind first to see modem_ID pools."
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

      <div className="mt-6">
        <MultiEntityChart
          plotted={plotted}
          seriesByName={seriesByName}
          latestByName={latestByName}
          busy={seriesBusy}
          allowPick
          entityLabel={entityLabel}
          onRemove={(name) => setPlotted((current) => current.filter((c) => c !== name))}
          onOpenPicker={() => setPickerOpen(true)}
        />
      </div>

      <form
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <input
          value={filterQ}
          onChange={(event) => setFilterQ(event.target.value)}
          placeholder={`Filter ${entityLabel.toLowerCase()}`}
          className="h-10 w-full max-w-md rounded-full border border-line bg-panel px-4 text-sm outline-none focus:border-accent"
        />
      </form>

      <div className="mt-4 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="text-quiet">
            <tr>
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
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      {onChart ? (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: colorFor(row.name, plotted) }}
                        />
                      ) : null}
                      {row.name}
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

      <EntityPickerDialog
        open={pickerOpen}
        rows={initialRows}
        selected={plotted}
        entityLabel={entityLabel}
        onClose={() => setPickerOpen(false)}
        onApply={setPlotted}
      />
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
