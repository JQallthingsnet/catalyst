"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ChangeRatePlanButton, type RatePlanOption } from "@/components/portal/change-rate-plan-button";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { LifecycleButtons } from "@/components/portal/lifecycle-buttons";
import { formatIccid } from "@/lib/portal/ids";
import { btnPrimary, btnSecondary } from "@/lib/portal/button-styles";
import { lifecycleTarget, type SimState } from "@/lib/portal/catalogue";
import {
  BULK_SIM_CAP,
  type BulkJobItemInput,
  type BulkJobStatus,
} from "@/lib/portal/sim-bulk-shared";

export type SimsInventoryRow = {
  id: string;
  iccid: string;
  tenantName: string | null;
  customerName: string | null;
  planName: string | null;
  platformPlanId: string | null;
  platformPlanName: string | null;
  wholesalePlan: string | null;
  ccStatus: string | null;
  imsi: string | null;
  msisdn: string | null;
  currentVolumeMb: number | null;
  poolName: string | null;
  state: string;
};

type Fields = {
  tenantName?: boolean;
  platformPlan?: boolean;
  ccRatePlan?: boolean;
  ccStatus?: boolean;
};

/** Per-column choices while selected - lifecycle and plan are independent. */
type StagedRow = {
  lifecycle: "" | "Activate" | "Deactivate";
  platformPlanId: string;
};

function asSimState(value: string): SimState | null {
  if (value === "Ready" || value === "Active" || value === "Suspended" || value === "Deactivated") {
    return value;
  }
  return null;
}

function rowReady(staged: StagedRow | undefined): boolean {
  if (!staged) return false;
  return staged.lifecycle !== "" || staged.platformPlanId !== "";
}

export function SimsInventoryPanel({
  sims,
  fields,
  planOptions,
  canLifecycle,
  canChangePlan,
  canAssign,
  headerLinks,
}: {
  sims: SimsInventoryRow[];
  fields: Fields;
  planOptions: RatePlanOption[];
  canLifecycle: boolean;
  canChangePlan: boolean;
  canAssign: boolean;
  headerLinks: ReactNode;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [staged, setStaged] = useState<Record<string, StagedRow>>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<BulkJobStatus | null>(null);
  /** ICCID + action lines shown in the confirm dialog (kept through the run). */
  const [confirmLines, setConfirmLines] = useState<{ iccid: string; label: string }[]>([]);

  const atCap = selected.length >= BULK_SIM_CAP;
  const selectionActive = selected.length > 0;

  const allReady = useMemo(
    () => selected.length > 0 && selected.every((iccid) => rowReady(staged[iccid])),
    [selected, staged],
  );

  const summary = useMemo(() => {
    const counts = { Activate: 0, Deactivate: 0, rate_plan: 0 };
    for (const iccid of selected) {
      const row = staged[iccid];
      if (!row) continue;
      if (row.lifecycle === "Activate") counts.Activate += 1;
      if (row.lifecycle === "Deactivate") counts.Deactivate += 1;
      if (row.platformPlanId) counts.rate_plan += 1;
    }
    return counts;
  }, [selected, staged]);

  function patchStaged(iccid: string, patch: Partial<StagedRow>) {
    setStaged((current) => {
      const prev = current[iccid] ?? { lifecycle: "", platformPlanId: "" };
      return { ...current, [iccid]: { ...prev, ...patch } };
    });
  }

  function toggle(iccid: string) {
    setSelected((current) => {
      if (current.includes(iccid)) {
        setStaged((prev) => {
          const copy = { ...prev };
          delete copy[iccid];
          return copy;
        });
        return current.filter((id) => id !== iccid);
      }
      if (current.length >= BULK_SIM_CAP) return current;
      setStaged((prev) => ({
        ...prev,
        [iccid]: { lifecycle: "", platformPlanId: "" },
      }));
      return [...current, iccid];
    });
  }

  function toggleAll() {
    const capSims = sims.slice(0, BULK_SIM_CAP);
    const capIds = capSims.map((sim) => sim.iccid);
    const allCapSelected = capIds.length > 0 && capIds.every((id) => selected.includes(id));
    if (allCapSelected) {
      setSelected([]);
      setStaged({});
      return;
    }
    const nextStaged: Record<string, StagedRow> = {};
    for (const sim of capSims) {
      nextStaged[sim.iccid] = { lifecycle: "", platformPlanId: "" };
    }
    setSelected(Object.keys(nextStaged));
    setStaged(nextStaged);
  }

  function buildItems(): BulkJobItemInput[] {
    const items: BulkJobItemInput[] = [];
    for (const iccid of selected) {
      const row = staged[iccid];
      if (!row) continue;
      if (row.lifecycle === "Activate" || row.lifecycle === "Deactivate") {
        items.push({ iccid, action: row.lifecycle });
      }
      if (row.platformPlanId) {
        items.push({ iccid, action: "rate_plan", platformPlanId: row.platformPlanId });
      }
    }
    return items;
  }

  function buildConfirmLines(): { iccid: string; label: string }[] {
    return buildItems().map((item) => {
      if (item.action === "rate_plan") {
        const planName =
          planOptions.find((plan) => plan.id === item.platformPlanId)?.label ??
          item.platformPlanId ??
          "Reseller Plan";
        return { iccid: item.iccid, label: `Reseller Plan → ${planName}` };
      }
      return { iccid: item.iccid, label: item.action };
    });
  }

  function openBulk() {
    if (!allReady) return;
    setError("");
    setJob(null);
    setConfirmLines(buildConfirmLines());
    setBulkOpen(true);
  }

  async function runJob(created: BulkJobStatus) {
    let current = created;
    setJob(current);
    while (current.status !== "completed" && current.status !== "failed") {
      const res = await fetch(`/api/portal/sims/bulk/${current.id}`, { method: "POST" });
      const data = (await res.json()) as { error?: string; job?: BulkJobStatus };
      if (!res.ok || !data.job) throw new Error(data.error ?? "Bulk process failed.");
      current = data.job;
      setJob(current);
    }
  }

  async function submitBulk() {
    if (!allReady) return;
    const items = buildItems();
    if (items.length === 0) {
      setError("Choose a lifecycle action and/or Reseller Plan on each selected SIM.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/sims/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = (await res.json()) as { error?: string; job?: BulkJobStatus };
      if (!res.ok || !data.job) {
        setError(data.error ?? "Bulk update failed.");
        return;
      }
      await runJob(data.job);
      setSelected([]);
      setStaged({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk update failed.");
    } finally {
      setBusy(false);
    }
  }

  const progressPct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
  const headerChecked =
    sims.length > 0 &&
    sims.slice(0, BULK_SIM_CAP).every((sim) => selected.includes(sim.iccid)) &&
    selected.length > 0;
  const changeCount = summary.Activate + summary.Deactivate + summary.rate_plan;
  const CONFIRM_LINE_CAP = 20;
  const shownConfirmLines = confirmLines.slice(0, CONFIRM_LINE_CAP);
  const hiddenConfirmLines = Math.max(0, confirmLines.length - shownConfirmLines.length);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">SIMs</h1>
          <p className="mt-1 text-sm text-quiet">
            Select SIMs (max {BULK_SIM_CAP}). Set Lifecycle and/or Reseller Plan per row, then Bulk update.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {headerLinks}
          {canLifecycle ? (
            <button
              type="button"
              onClick={openBulk}
              disabled={!allReady}
              title={
                !selectionActive
                  ? "Select SIMs first"
                  : allReady
                    ? undefined
                    : "Set Lifecycle and/or Reseller Plan on every selected SIM"
              }
              className={selectionActive ? btnPrimary : btnSecondary}
            >
              Bulk update{selected.length ? ` (${selected.length})` : ""}
            </button>
          ) : null}
          {canAssign ? (
            <Link href="/dashboard/sims/assign" className={selectionActive ? btnSecondary : btnPrimary}>
              Assign SIMs
            </Link>
          ) : null}
        </div>
      </div>

      {selectionActive ? (
        <p className="mt-3 text-xs text-quiet">
          {selected.length} selected
          {atCap ? ` · cap ${BULK_SIM_CAP}` : ` · max ${BULK_SIM_CAP}`}
          {summary.Activate ? ` · Activate ${summary.Activate}` : ""}
          {summary.Deactivate ? ` · Deactivate ${summary.Deactivate}` : ""}
          {summary.rate_plan ? ` · Plan ${summary.rate_plan}` : ""}
          {!allReady ? " · pick Lifecycle and/or Reseller Plan on each selected row" : ""}.
          <button
            type="button"
            className="ml-2 text-accent hover:underline"
            onClick={() => {
              setSelected([]);
              setStaged({});
            }}
          >
            Clear
          </button>
        </p>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="text-quiet">
            <tr>
              {canLifecycle ? (
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={headerChecked}
                    onChange={toggleAll}
                    aria-label={`Select up to ${BULK_SIM_CAP} SIMs`}
                  />
                </th>
              ) : null}
              {fields.tenantName ? <th className="px-4 py-3">Organisation</th> : null}
              <th className="px-4 py-3">ICCID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Retail plan</th>
              {fields.platformPlan ? <th className="px-4 py-3">Reseller Plan</th> : null}
              {fields.ccRatePlan ? <th className="px-4 py-3">CC rate plan</th> : null}
              {fields.ccStatus ? <th className="px-4 py-3">CC status</th> : null}
              <th className="px-4 py-3">IMSI</th>
              <th className="px-4 py-3">MSISDN</th>
              <th className="px-4 py-3">CTD MB</th>
              <th className="px-4 py-3">Pool</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Lifecycle</th>
              {canChangePlan ? <th className="px-4 py-3">Reseller Plan</th> : null}
            </tr>
          </thead>
          <tbody>
            {sims.map((sim) => {
              const checked = selected.includes(sim.iccid);
              const rowLocked = atCap && !checked;
              const rowStaged = staged[sim.iccid];
              const simState = asSimState(sim.state);
              const dash = "—";
              return (
                <tr key={sim.id} className={`border-t border-line ${rowLocked ? "opacity-40" : ""}`}>
                  {canLifecycle ? (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={rowLocked}
                        onChange={() => toggle(sim.iccid)}
                        aria-label={`Select ${sim.iccid}`}
                      />
                    </td>
                  ) : null}
                  {fields.tenantName ? <td className="px-4 py-3">{sim.tenantName ?? dash}</td> : null}
                  <td className="px-4 py-3 font-mono">{formatIccid(sim.iccid)}</td>
                  <td className="px-4 py-3">{sim.customerName ?? dash}</td>
                  <td className="px-4 py-3">{sim.planName ?? dash}</td>
                  {fields.platformPlan ? <td className="px-4 py-3">{sim.platformPlanName ?? dash}</td> : null}
                  {fields.ccRatePlan ? <td className="px-4 py-3">{sim.wholesalePlan ?? dash}</td> : null}
                  {fields.ccStatus ? <td className="px-4 py-3">{sim.ccStatus ?? dash}</td> : null}
                  <td className="px-4 py-3 font-mono">{sim.imsi ?? dash}</td>
                  <td className="px-4 py-3 font-mono">{sim.msisdn ?? dash}</td>
                  <td className="px-4 py-3">
                    {sim.currentVolumeMb != null ? `${sim.currentVolumeMb} MB` : dash}
                  </td>
                  <td className="px-4 py-3">{sim.poolName ?? dash}</td>
                  <td className="px-4 py-3">{sim.state}</td>
                  <td className="px-4 py-3">
                    {checked && canLifecycle ? (
                      <select
                        value={rowStaged?.lifecycle ?? ""}
                        onChange={(event) =>
                          patchStaged(sim.iccid, {
                            lifecycle: event.target.value as StagedRow["lifecycle"],
                          })
                        }
                        className="rounded-lg border border-line bg-canvas px-2 py-1 text-[11px]"
                      >
                        <option value="">No change</option>
                        <option
                          value="Activate"
                          disabled={!(simState && lifecycleTarget("Activate", simState))}
                        >
                          Activate
                        </option>
                        <option
                          value="Deactivate"
                          disabled={!(simState && lifecycleTarget("Deactivate", simState))}
                        >
                          Deactivate
                        </option>
                      </select>
                    ) : canLifecycle ? (
                      <LifecycleButtons iccid={sim.iccid} state={sim.state} />
                    ) : (
                      sim.state
                    )}
                  </td>
                  {canChangePlan ? (
                    <td className="px-4 py-3">
                      {checked ? (
                        <select
                          value={rowStaged?.platformPlanId ?? ""}
                          onChange={(event) =>
                            patchStaged(sim.iccid, { platformPlanId: event.target.value })
                          }
                          className="max-w-40 rounded-lg border border-line bg-canvas px-2 py-1 text-[11px]"
                        >
                          <option value="">No change</option>
                          {planOptions
                            .filter((plan) => plan.id !== sim.platformPlanId)
                            .map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.label}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <ChangeRatePlanButton
                          iccid={sim.iccid}
                          currentPlatformPlanId={sim.platformPlanId}
                          options={planOptions}
                        />
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {sims.length === 0 ? <p className="px-4 py-8 text-sm text-quiet">No SIMs match this search.</p> : null}
      </div>

      {bulkOpen ? (
        <ConfirmDialog
          open
          title="Bulk update"
          body={
            <div className="space-y-4">
              {!job ? (
                <div className="space-y-3 text-sm">
                  <p>
                    Push <span className="font-medium text-ink">{confirmLines.length}</span> change
                    {confirmLines.length === 1 ? "" : "s"}:
                  </p>
                  <ul className="max-h-48 space-y-1 overflow-auto text-[12px] text-quiet">
                    {shownConfirmLines.map((line) => (
                      <li key={`${line.iccid}:${line.label}`} className="font-mono">
                        <span className="text-ink">{formatIccid(line.iccid)}</span>
                        <span className="text-quiet"> · {line.label}</span>
                      </li>
                    ))}
                  </ul>
                  {hiddenConfirmLines > 0 ? (
                    <p className="text-xs text-quiet">+{hiddenConfirmLines} more</p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="h-2 overflow-hidden rounded-full bg-panel-2">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="text-sm">
                    {job.status === "completed"
                      ? `Finished — ${job.okCount} ok${job.failedCount ? `, ${job.failedCount} failed` : ""}.`
                      : `Working… ${job.done} of ${job.total}`}
                  </p>
                  {confirmLines.length > 0 ? (
                    <ul className="max-h-36 space-y-1 overflow-auto text-[12px] text-quiet">
                      {shownConfirmLines.map((line) => (
                        <li key={`run-${line.iccid}:${line.label}`} className="font-mono">
                          <span className="text-ink">{formatIccid(line.iccid)}</span>
                          <span className="text-quiet"> · {line.label}</span>
                        </li>
                      ))}
                      {hiddenConfirmLines > 0 ? (
                        <li className="text-xs">+{hiddenConfirmLines} more</li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
              )}
            </div>
          }
          confirmLabel={
            job?.status === "completed"
              ? "Done"
              : `Run ${confirmLines.length || changeCount} update${(confirmLines.length || changeCount) === 1 ? "" : "s"}`
          }
          tone="accent"
          busy={busy}
          error={error}
          onClose={() => {
            if (busy) return;
            setBulkOpen(false);
            setJob(null);
            setConfirmLines([]);
            setError("");
            if (job?.status === "completed") window.location.reload();
          }}
          onConfirm={() => {
            if (job?.status === "completed") {
              setBulkOpen(false);
              setJob(null);
              setConfirmLines([]);
              window.location.reload();
              return;
            }
            void submitBulk();
          }}
        />
      ) : null}
    </div>
  );
}
