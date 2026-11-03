"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModemAllowancesDialog } from "@/components/portal/modem-allowances-dialog";
import { RatePlanAllowancesDialog } from "@/components/portal/rate-plan-allowances-dialog";
import { btnPrimary, btnSecondary } from "@/lib/portal/button-styles";

export type PoolGroupBy = "rate_plan" | "modem" | "customer";

export type PoolLatestRow = {
  name: string;
  day: string;
  ctdUsageMb: number;
  ctdSms: number;
  ctdVoiceMin: number;
  allowanceMb: number;
  modemCount: number;
  simCount: number;
  pct: number;
  customer?: string | null;
  perSimAllowanceMb?: number | null;
  topupSimUnits?: number;
  topupAllowanceMb?: number;
  unitPriceAud?: number | null;
  onContract?: boolean;
};

export type PoolSeriesPoint = {
  name: string;
  day: string;
  ctdUsageMb: number;
  ctdSms: number;
  ctdVoiceMin: number;
  allowanceMb: number;
};

type PoolChartMetric = "data" | "sms" | "voice";

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
            <button type="button" onClick={onClose} className={btnSecondary}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const ordered = sorted.map((row) => row.name).filter((name) => draft.has(name));
                onApply(ordered);
                onClose();
              }}
              className={btnPrimary}
            >
              Apply ({draft.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatAxisShort(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return `${Math.round(value)}`;
}

function metricValue(point: PoolSeriesPoint, metric: PoolChartMetric): number {
  if (metric === "sms") return point.ctdSms ?? 0;
  if (metric === "voice") return point.ctdVoiceMin ?? 0;
  return point.ctdUsageMb;
}

function MultiEntityChart({
  plotted,
  seriesByName,
  latestByName,
  busy,
  allowPick,
  entityLabel,
  metric = "data",
  title = "CTD usage over time",
  subtitle,
  fillCard = false,
  onOpenPicker,
}: {
  plotted: string[];
  seriesByName: Map<string, PoolSeriesPoint[]>;
  latestByName: Map<string, PoolLatestRow>;
  busy: boolean;
  allowPick: boolean;
  entityLabel: string;
  metric?: PoolChartMetric;
  title?: string;
  subtitle?: string;
  /** Stretch plot to the card (dashboard embed). */
  fillCard?: boolean;
  onOpenPicker: () => void;
}) {
  const showAllowance = metric === "data";
  const unitLabel = metric === "sms" ? "msgs" : metric === "voice" ? "min" : "MB";
  const plotRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 720, height: fillCard ? 320 : 280 });
  const [hover, setHover] = useState<{
    name: string;
    day: string;
    value: number;
    allowanceMb: number;
    pct: number;
    color: string;
    clientX: number;
    clientY: number;
  } | null>(null);

  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const nextW = Math.max(280, Math.floor(rect.width));
      const nextH = Math.max(fillCard ? 220 : 200, Math.floor(rect.height));
      setSize((prev) =>
        prev.width === nextW && prev.height === nextH ? prev : { width: nextW, height: nextH },
      );
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fillCard]);

  const days = useMemo(() => {
    const set = new Set<string>();
    for (const name of plotted) {
      for (const point of seriesByName.get(name) ?? []) set.add(point.day);
    }
    return [...set].sort();
  }, [plotted, seriesByName]);

  // Scale to the plotted metric so large allowances don't squash the usage lines.
  const maxValue = useMemo(() => {
    let max = 1;
    for (const name of plotted) {
      for (const point of seriesByName.get(name) ?? []) {
        max = Math.max(max, metricValue(point, metric));
      }
    }
    return max * 1.12;
  }, [plotted, seriesByName, metric]);

  const width = size.width;
  const height = size.height;
  const padL = 52;
  const padR = 20;
  const padT = 20;
  const padB = 36;
  const innerW = Math.max(1, width - padL - padR);
  const innerH = Math.max(1, height - padT - padB);

  function xAt(i: number) {
    if (days.length <= 1) return padL + innerW / 2;
    return padL + (i / (days.length - 1)) * innerW;
  }

  function yAt(value: number) {
    const clamped = Math.min(Math.max(value, 0), maxValue);
    return padT + innerH - (clamped / maxValue) * innerH;
  }

  const defaultHint =
    metric === "data"
      ? `Sydney day · solid CTD · dashed allowance (hover a point)${
          allowPick ? ` · top 10 ${entityLabel.toLowerCase()}s` : ""
        }${days.length === 1 ? " · lines from day 2" : ""}`
      : `Sydney day · same grouping as data${
          allowPick ? ` · same series as data chart` : ""
        }${days.length === 1 ? " · lines from day 2" : ""}`;
  const hint = subtitle ?? defaultHint;

  return (
    <article className="flex h-full min-h-0 flex-col rounded-card border border-line bg-panel p-4 sm:p-5">
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

      <div
        ref={plotRef}
        className={`relative mt-4 min-h-0 ${
          fillCard ? "flex-1" : "h-64 sm:h-72"
        }`}
      >
        {plotted.length === 0 || days.length === 0 ? (
          <p className="flex h-full min-h-48 items-center text-sm text-quiet">
            {allowPick
              ? `No daily points yet — open Pools or wait for the daily snapshot, then add ${entityLabel.toLowerCase()}s.`
              : "No daily points yet — saved after Sydney midnight / first open."}
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
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
                    {t === 0 ? "0" : formatAxisShort(maxValue * t)}
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
              const valuePath = buildPath((p) => metricValue(p, metric));
              const allowPath = showAllowance ? buildPath((p) => p.allowanceMb) : "";
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
                  {valuePath ? (
                    <path
                      d={valuePath}
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
                    const value = metricValue(p, metric);
                    const latest = latestByName.get(name);
                    const pct =
                      latest?.pct ??
                      (p.allowanceMb > 0 ? Math.round((p.ctdUsageMb / p.allowanceMb) * 100) : 0);
                    return (
                      <circle
                        key={`${name}-${day}`}
                        cx={xAt(i)}
                        cy={yAt(value)}
                        r={active ? 5 : 3.5}
                        fill={color}
                        className="cursor-pointer"
                        onMouseEnter={(event) => {
                          setHover({
                            name,
                            day,
                            value,
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
              CTD {hover.value.toLocaleString("en-AU", { maximumFractionDigits: metric === "data" ? 0 : 1 })}{" "}
              {unitLabel}
            </p>
            {showAllowance ? (
              <p className="text-xs text-quiet">
                Cap {hover.allowanceMb.toLocaleString("en-AU", { maximumFractionDigits: 0 })} MB ·{" "}
                {hover.pct}%
              </p>
            ) : null}
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
  /** Pools plot groups by Catalyst Reseller Plan or Jasper rate plan (Supplier code). */
  groupBy?: PoolGroupBy;
  /** `chart` = embeddable CTD plot only (e.g. Dashboard). */
  mode?: "full" | "chart";
}) {
  // Super admin: Jasper rate plan → Supplier code. Reseller: Catalyst Reseller Plan (from first-sync modem_ID).
  const entityLabel =
    groupBy === "modem" ? "Reseller Plan" : groupBy === "rate_plan" ? "Supplier code" : "CC customer";
  const allowanceLabel =
    groupBy === "modem" ? "Reseller Plan allowance MB" : "Supplier code allowance MB";
  const [filterQ, setFilterQ] = useState("");
  const [plotted, setPlotted] = useState<string[]>(() => topByUsage(initialRows, 10));
  const [series, setSeries] = useState<PoolSeriesPoint[]>([]);
  const [seriesBusy, setSeriesBusy] = useState(false);
  const [modemAllowancesOpen, setModemAllowancesOpen] = useState(false);
  const [ratePlanAllowancesOpen, setRatePlanAllowancesOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState(initialRows);
  const [topupDrafts, setTopupDrafts] = useState<Record<string, string>>({});
  const [topupBusy, setTopupBusy] = useState<string | null>(null);
  const canBuyTopup = !platformView && groupBy === "modem" && canEdit;

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const latestByName = useMemo(() => {
    const map = new Map<string, PoolLatestRow>();
    for (const row of rows) map.set(row.name, row);
    return map;
  }, [rows]);

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
    const sorted = [...rows].sort((a, b) => b.ctdUsageMb - a.ctdUsageMb);
    if (!q) return sorted;
    return sorted.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.customer ?? "").toLowerCase().includes(q),
    );
  }, [filterQ, rows]);

  function addToPlot(name: string) {
    setPlotted((current) => (current.includes(name) ? current : [...current, name]));
  }

  async function buyTopup(modemId: string) {
    const raw = topupDrafts[modemId] ?? "";
    const simUnits = Math.floor(Number(raw));
    if (!Number.isFinite(simUnits) || simUnits < 1) {
      setMessage("Enter SIM units of at least 1.");
      return;
    }
    setTopupBusy(modemId);
    setMessage("");
    try {
      const res = await fetch("/api/portal/pool-topups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modemId, simUnits }),
      });
      const data = (await res.json()) as {
        error?: string;
        topup?: {
          simUnits: number;
          allowanceMb: number;
          chargeAud: number;
          unitPriceAud: number;
        };
      };
      if (!res.ok) throw new Error(data.error ?? "Could not buy pool top-up.");
      const added = data.topup;
      setRows((current) =>
        current.map((row) => {
          if (row.name !== modemId || !added) return row;
          const allowanceMb = row.allowanceMb + added.allowanceMb;
          return {
            ...row,
            allowanceMb,
            topupSimUnits: (row.topupSimUnits ?? 0) + added.simUnits,
            topupAllowanceMb: (row.topupAllowanceMb ?? 0) + added.allowanceMb,
            pct: allowanceMb > 0 ? Math.round((row.ctdUsageMb / allowanceMb) * 100) : 0,
          };
        }),
      );
      setTopupDrafts((current) => ({ ...current, [modemId]: "" }));
      setMessage(
        `Top-up applied for ${modemId}: +${added?.simUnits ?? simUnits} SIM unit${(added?.simUnits ?? simUnits) === 1 ? "" : "s"} · +${(added?.allowanceMb ?? 0).toLocaleString("en-AU")} MB · $${(added?.chargeAud ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (this month).`,
      );
      void loadSeries(plotted);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not buy pool top-up.");
    } finally {
      setTopupBusy(null);
    }
  }

  const groupTitle =
    groupBy === "modem" ? "Reseller Plan" : groupBy === "rate_plan" ? "Supplier code" : "CC customer";

  const dataChart = (
    <MultiEntityChart
      plotted={plotted}
      seriesByName={seriesByName}
      latestByName={latestByName}
      busy={seriesBusy}
      allowPick={platformView}
      entityLabel={entityLabel}
      metric="data"
      fillCard={mode === "chart"}
      title={
        mode === "chart"
          ? `Data usage by ${groupTitle}`
          : "CTD data over time"
      }
      subtitle={
        mode === "chart"
          ? "Same plot as Pools · top 10 by CTD data · hover a point for details"
          : undefined
      }
      onOpenPicker={() => setPickerOpen(true)}
    />
  );

  const smsChart = (
    <MultiEntityChart
      plotted={plotted}
      seriesByName={seriesByName}
      latestByName={latestByName}
      busy={seriesBusy}
      allowPick={false}
      entityLabel={entityLabel}
      metric="sms"
      title={`CTD SMS by ${groupTitle}`}
      subtitle="Same series as data · messages (MO+MT)"
      onOpenPicker={() => setPickerOpen(true)}
    />
  );

  const voiceChart = (
    <MultiEntityChart
      plotted={plotted}
      seriesByName={seriesByName}
      latestByName={latestByName}
      busy={seriesBusy}
      allowPick={false}
      entityLabel={entityLabel}
      metric="voice"
      title={`CTD voice by ${groupTitle}`}
      subtitle="Same series as data · minutes"
      onOpenPicker={() => setPickerOpen(true)}
    />
  );

  const charts = (
    <div className="space-y-6">
      {dataChart}
      {smsChart}
      {voiceChart}
    </div>
  );

  const picker = (
    <EntityPickerDialog
      open={pickerOpen}
      rows={rows}
      selected={plotted}
      entityLabel={entityLabel}
      onClose={() => setPickerOpen(false)}
      onApply={setPlotted}
    />
  );

  if (mode === "chart") {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col">
        {message ? <p className="mb-3 shrink-0 text-sm text-quiet">{message}</p> : null}
        <div className="min-h-0 flex-1">{dataChart}</div>
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
            {groupBy === "rate_plan"
              ? "Grouped by Supplier code (Jasper rate plan): daily Σ CTD MB and Σ Supplier code allowance across SIMs on that plan (one point per Sydney calendar day)."
              : groupBy === "modem" && scopedCustomer
                ? `Grouped by Reseller Plan for CC customer “${scopedCustomer}”: daily Σ CTD MB and Σ Reseller Plan allowance across SIMs on that plan (one point per Sydney calendar day).${canBuyTopup ? " Buy pool top-up in SIM units for the current Sydney month — applies immediately, no SIMs shipped." : ""}`
                : groupBy === "modem"
                  ? "This organisation is not bound to a Control Center customer yet. Sell stock / bind first to see Reseller Plan pools."
                  : scopedCustomer
                    ? `Your organisation’s Control Center customer “${scopedCustomer}”: daily CTD MB and Reseller Plan allowance (one point per Sydney calendar day, auto-saved).`
                    : "This organisation is not bound to a Control Center customer yet. Sell stock / bind first to see pool usage."}
          </p>
        </div>
        {canEdit && platformView ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRatePlanAllowancesOpen(true)}
              className={btnSecondary}
            >
              Supplier code allowances
            </button>
            <button
              type="button"
              onClick={() => setModemAllowancesOpen(true)}
              className={btnSecondary}
            >
              Reseller Plan allowances
            </button>
          </div>
        ) : null}
        {canBuyTopup ? (
          <Link href="/dashboard/invoices" className={btnSecondary}>
            Invoices
          </Link>
        ) : null}
      </div>

      {message ? <p className="mt-3 text-sm text-quiet">{message}</p> : null}

      <div className="mt-6">{charts}</div>

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
              ? "Filter Reseller Plan or customer"
              : groupBy === "rate_plan"
                ? "Filter Supplier code"
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
              <th className="px-4 py-3">CTD SMS</th>
              <th className="px-4 py-3">CTD voice (min)</th>
              <th className="px-4 py-3">{allowanceLabel}</th>
              <th className="px-4 py-3">%</th>
              <th className="px-4 py-3">SIMs</th>
              {canBuyTopup ? <th className="px-4 py-3">Top-up this month</th> : null}
              <th className="px-4 py-3">Chart</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const onChart = plotted.includes(row.name);
              const perSim = row.perSimAllowanceMb;
              const onContract = row.onContract !== false && row.unitPriceAud != null;
              const canTopupPlan = perSim != null && perSim > 0;
              const unitsDraft = topupDrafts[row.name] ?? "";
              const draftUnits = Math.floor(Number(unitsDraft));
              const quoteOk =
                Number.isFinite(draftUnits) && draftUnits >= 1 && canTopupPlan && onContract;
              const quoteMb = quoteOk && perSim != null ? perSim * draftUnits : 0;
              const quoteAud =
                quoteOk && row.unitPriceAud != null ? row.unitPriceAud * draftUnits : null;
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
                    {(row.ctdSms ?? 0).toLocaleString("en-AU", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-3">
                    {(row.ctdVoiceMin ?? 0).toLocaleString("en-AU", { maximumFractionDigits: 1 })}
                  </td>
                  <td className="px-4 py-3">
                    <div>{row.allowanceMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}</div>
                    {canBuyTopup && (row.topupSimUnits ?? 0) > 0 ? (
                      <div className="mt-0.5 text-xs text-quiet">
                        incl. +{(row.topupSimUnits ?? 0).toLocaleString("en-AU")} SIM unit
                        {(row.topupSimUnits ?? 0) === 1 ? "" : "s"}
                      </div>
                    ) : null}
                  </td>
                  <td
                    className={`px-4 py-3 ${
                      row.pct >= 100 ? "text-danger" : row.pct >= 80 ? "text-warn" : "text-ok"
                    }`}
                  >
                    {row.pct}%
                  </td>
                  <td className="px-4 py-3">{row.simCount}</td>
                  {canBuyTopup ? (
                    <td className="px-4 py-3">
                      {!onContract ? (
                        <div className="max-w-64 space-y-1 text-xs">
                          <p className="text-warn">Legacy plan</p>
                          <p className="text-quiet">
                            Ask supplier to add{" "}
                            <span className="font-mono text-ink">{row.name}</span> under{" "}
                            <Link href="/dashboard/contracts" className="text-accent hover:underline">
                              Contract
                            </Link>{" "}
                            with the unit price before top-up.
                          </p>
                        </div>
                      ) : canTopupPlan ? (
                        <div className="flex min-w-56 flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={5000}
                              step={1}
                              value={unitsDraft}
                              onChange={(event) =>
                                setTopupDrafts((current) => ({
                                  ...current,
                                  [row.name]: event.target.value,
                                }))
                              }
                              placeholder="SIM units"
                              className="h-9 w-24 rounded-lg border border-line bg-canvas px-2 font-mono text-xs outline-none focus:border-accent"
                            />
                            <button
                              type="button"
                              disabled={topupBusy === row.name || !quoteOk}
                              onClick={() => void buyTopup(row.name)}
                              className="inline-flex h-9 items-center justify-center rounded-full bg-accent px-3 text-xs font-medium text-accent-ink disabled:opacity-40"
                            >
                              {topupBusy === row.name ? "Buying…" : "Buy top-up"}
                            </button>
                          </div>
                          <p className="text-xs text-quiet">
                            {`$${(row.unitPriceAud ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / SIM unit`}
                            {quoteOk
                              ? ` · +${quoteMb.toLocaleString("en-AU")} MB${
                                  quoteAud != null
                                    ? ` · $${quoteAud.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : ""
                                }`
                              : null}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-quiet">
                          {perSim === 0 ? "PAYG — no top-up" : "Set allowance first"}
                        </span>
                      )}
                    </td>
                  ) : null}
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
