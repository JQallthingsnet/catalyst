"use client";

import { useState } from "react";
import { formatIccid } from "@/lib/portal/ids";
import type { SimPlatformPlanDailyMatrix } from "@/lib/portal/sim-platform-plan-daily";

function formatDayHeader(day: string): string {
  // 2026-10-29 → 29/10
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${m[3]}/${m[2]}`;
}

export function ResellerPlanDailyMatrix({ matrix }: { matrix: SimPlatformPlanDailyMatrix }) {
  const [selected, setSelected] = useState<{ iccid: string; day: string } | null>(null);

  if (matrix.days.length === 0) {
    return (
      <p className="rounded-card border border-line bg-panel px-4 py-6 text-sm text-quiet">
        No daily Reseller Plan usage in this date range yet. It fills when SIMs have a plan and after Sync /
        plan changes (and the daily stamp).
      </p>
    );
  }

  if (matrix.rows.length === 0) {
    return (
      <p className="rounded-card border border-line bg-panel px-4 py-6 text-sm text-quiet">
        No ICCIDs with daily Reseller Plan records for this organisation in the selected dates.
      </p>
    );
  }

  const detail =
    selected == null
      ? null
      : matrix.rows
          .find((row) => row.iccid === selected.iccid)
          ?.cells.find((cell) => cell.day === selected.day) ?? null;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="border-b border-line text-quiet">
            <tr>
              <th className="sticky left-0 z-10 bg-panel px-3 py-2 font-medium">ICCID</th>
              {matrix.days.map((day) => (
                <th key={day} className="px-2 py-2 text-center font-medium tabular-nums" title={day}>
                  {formatDayHeader(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.iccid} className="border-t border-line">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-panel px-3 py-2 font-mono text-xs">
                  {formatIccid(row.iccid)}
                </td>
                {row.cells.map((cell) => {
                  const isSelected =
                    selected?.iccid === row.iccid && selected.day === cell.day;
                  const hasData = cell.planCount > 0;
                  const changed = cell.planCount > 1;
                  return (
                    <td key={cell.day} className="px-1 py-1 text-center">
                      {hasData ? (
                        <button
                          type="button"
                          onClick={() =>
                            setSelected(
                              isSelected ? null : { iccid: row.iccid, day: cell.day },
                            )
                          }
                          className={`inline-flex min-w-8 items-center justify-center rounded-md px-1.5 py-1 text-xs tabular-nums ${
                            isSelected
                              ? "bg-accent text-accent-ink"
                              : changed
                                ? "bg-danger/15 text-danger hover:bg-danger/25"
                                : "bg-canvas text-ink hover:border-accent border border-transparent"
                          }`}
                          title={
                            changed
                              ? `${cell.planCount} Reseller Plans on ${cell.day} — click for details`
                              : `${cell.plans[0]?.planName ?? "Plan"} on ${cell.day}`
                          }
                        >
                          {cell.planCount}
                        </button>
                      ) : (
                        <span className="text-quiet">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && selected ? (
        <article className="rounded-card border border-line bg-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-ink">
                {formatIccid(selected.iccid)} · {selected.day}
              </p>
              <p className="mt-1 text-xs text-quiet">
                Plan count {detail.planCount}
                {detail.planCount > 1 ? " (changed this day)" : " (no change this day)"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-sm text-accent hover:underline"
            >
              Close
            </button>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {detail.plans.map((plan) => (
              <li
                key={plan.platformPlanId}
                className="flex flex-wrap justify-between gap-2 rounded-xl border border-line px-3 py-2"
              >
                <span className="font-medium">{plan.planName}</span>
                <span className="text-quiet">
                  Supplier code {plan.supplierCode?.trim() || "—"}
                </span>
              </li>
            ))}
          </ul>
        </article>
      ) : (
        <p className="text-xs text-quiet">
          Cells show plan count for that Sydney day (1 = single plan, 2+ = changed). Click a cell for Reseller
          Plan details.
        </p>
      )}
    </div>
  );
}
