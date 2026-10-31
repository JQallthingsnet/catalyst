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

/** Fixed sticky widths so Organisation does not cover day 1 (01/MM). */
const ORG_STICKY = "left-0 w-36 min-w-36 max-w-36";
const ICCID_STICKY_WITH_ORG = "left-36 w-48 min-w-48 max-w-48";
const ICCID_STICKY_ONLY = "left-0 w-48 min-w-48 max-w-48";

export function ResellerPlanDailyMatrix({
  matrix,
  showSupplierCode = false,
}: {
  matrix: SimPlatformPlanDailyMatrix;
  /** Jasper Supplier code in cell detail — ATN / super admin only. */
  showSupplierCode?: boolean;
}) {
  const [selected, setSelected] = useState<{ iccid: string; day: string } | null>(null);
  const showOrg = matrix.includeOrganisation;
  const firstDay = matrix.days[0];
  const lastDay = matrix.days[matrix.days.length - 1];

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
        {showOrg
          ? "No ICCIDs with daily Reseller Plan records in the selected dates."
          : "No ICCIDs with daily Reseller Plan records for this organisation in the selected dates."}
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
      <p className="text-xs text-quiet">
        Columns {formatDayHeader(firstDay)}
        {firstDay !== lastDay ? ` → ${formatDayHeader(lastDay)}` : ""}
        {" · "}
        {matrix.days.length} Sydney day{matrix.days.length === 1 ? "" : "s"}
        {showOrg ? " · all organisations" : ""}
      </p>
      <div className="overflow-x-auto rounded-card border border-line bg-panel">
        <table className="border-separate border-spacing-0 text-left text-sm">
          <thead className="text-quiet">
            <tr>
              {showOrg ? (
                <th
                  className={`sticky z-20 border-b border-line bg-panel px-2 py-2 text-left font-medium ${ORG_STICKY}`}
                >
                  Organisation
                </th>
              ) : null}
              <th
                className={`sticky z-20 border-b border-r border-line bg-panel px-2 py-2 text-left font-medium ${
                  showOrg ? ICCID_STICKY_WITH_ORG : ICCID_STICKY_ONLY
                }`}
              >
                ICCID
              </th>
              {matrix.days.map((day) => (
                <th
                  key={day}
                  className="relative z-0 h-28 w-10 min-w-10 max-w-10 border-b border-line px-0 align-bottom font-medium"
                  title={day}
                >
                  <div className="flex h-full w-full items-end justify-center pb-1">
                    <span
                      className="text-xs tabular-nums tracking-tight"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                    >
                      {formatDayHeader(day)}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={`${row.tenantId ?? ""}:${row.iccid}`}>
                {showOrg ? (
                  <td
                    className={`sticky z-20 truncate border-b border-line bg-panel px-2 py-2 text-xs text-quiet ${ORG_STICKY}`}
                    title={row.organisationName ?? undefined}
                  >
                    {row.organisationName ?? "—"}
                  </td>
                ) : null}
                <td
                  className={`sticky z-20 border-b border-r border-line bg-panel px-2 py-2 font-mono text-xs ${
                    showOrg ? ICCID_STICKY_WITH_ORG : ICCID_STICKY_ONLY
                  }`}
                >
                  {formatIccid(row.iccid)}
                </td>
                {row.cells.map((cell) => {
                  const isSelected =
                    selected?.iccid === row.iccid && selected.day === cell.day;
                  const hasData = cell.planCount > 0;
                  const changed = cell.planCount > 1;
                  return (
                    <td
                      key={cell.day}
                      className="relative z-0 w-10 min-w-10 max-w-10 border-b border-line px-0 py-1 text-center"
                    >
                      {hasData ? (
                        <button
                          type="button"
                          onClick={() =>
                            setSelected(
                              isSelected ? null : { iccid: row.iccid, day: cell.day },
                            )
                          }
                          className={`inline-flex min-w-7 items-center justify-center rounded-md px-1 py-1 text-xs tabular-nums ${
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
                {showSupplierCode ? (
                  <span className="text-quiet">
                    Supplier code {plan.supplierCode?.trim() || "—"}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </article>
      ) : (
        <p className="text-xs text-quiet">
          Every Sydney calendar day in the From/To range is a column. Cells show plan count (1 = single plan, 2+ =
          changed). Click a cell for Reseller Plan details.
        </p>
      )}
    </div>
  );
}
