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
  type BulkItemAction,
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

type StagedAction = {
  action: BulkItemAction;
  platformPlanId?: string;
};

function asSimState(value: string): SimState | null {
  if (value === "Ready" || value === "Active" || value === "Suspended" || value === "Deactivated") {
    return value;
  }
  return null;
}

function defaultActionForState(state: string, canChangePlan: boolean): StagedAction | null {
  const simState = asSimState(state);
  if (!simState) return null;
  if (lifecycleTarget("Deactivate", simState)) return { action: "Deactivate" };
  if (lifecycleTarget("Activate", simState)) return { action: "Activate" };
  if (canChangePlan) return { action: "rate_plan", platformPlanId: undefined };
  return null;
}

function actionReady(staged: StagedAction | undefined, canChangePlan: boolean): boolean {
  if (!staged) return false;
  if (staged.action === "rate_plan") {
    return canChangePlan && Boolean(staged.platformPlanId);
  }
  return staged.action === "Activate" || staged.action === "Deactivate";
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
  const [staged, setStaged] = useState<Record<string, StagedAction>>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<BulkJobStatus | null>(null);

  const atCap = selected.length >= BULK_SIM_CAP;
  const selectionActive = selected.length > 0;

  const allReady = useMemo(
    () => selected.length > 0 && selected.every((iccid) => actionReady(staged[iccid], canChangePlan)),
    [selected, staged, canChangePlan],
  );

  const summary = useMemo(() => {
    const counts = { Activate: 0, Deactivate: 0, rate_plan: 0 };
    for (const iccid of selected) {
      const action = staged[iccid]?.action;
      if (action) counts[action] += 1;
    }
    return counts;
  }, [selected, staged]);

  function setRowAction(iccid: string, next: StagedAction) {
    setStaged((current) => ({ ...current, [iccid]: next }));
  }

  function toggle(iccid: string, state: string) {
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
      const def = defaultActionForState(state, canChangePlan);
      if (def) {
        setStaged((prev) => ({
          ...prev,
          [iccid]: {
            ...def,
            platformPlanId:
              def.action === "rate_plan"
                ? planOptions.find((p) => p.id !== sims.find((s) => s.iccid === iccid)?.platformPlanId)?.id ??
                  planOptions[0]?.id
                : undefined,
          },
        }));
      }
      return [...current, iccid];
    });
  }

  function toggleAll() {
    const capIds = sims.map((sim) => sim.iccid).slice(0, BULK_SIM_CAP);
    const allCapSelected = capIds.length > 0 && capIds.every((id) => selected.includes(id));
    if (allCapSelected) {
      setSelected([]);
      setStaged({});
      return;
    }
    const nextStaged: Record<string, StagedAction> = {};
    for (const sim of sims.slice(0, BULK_SIM_CAP)) {
      const def = defaultActionForState(sim.state, canChangePlan);
      if (!def) continue;
      nextStaged[sim.iccid] = {
        ...def,
        platformPlanId:
          def.action === "rate_plan"
            ? planOptions.find((p) => p.id !== sim.platformPlanId)?.id ?? planOptions[0]?.id
            : undefined,
      };
    }
    setSelected(Object.keys(nextStaged));
    setStaged(nextStaged);
  }

  function openBulk() {
    if (!allReady) return;
    setError("");
    setJob(null);
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
    const items: BulkJobItemInput[] = selected.map((iccid) => {
      const row = staged[iccid]!;
      return {
        iccid,
        action: row.action,
        platformPlanId: row.action === "rate_plan" ? row.platformPlanId : undefined,
      };
    });
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

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">SIMs</h1>
          <p className="mt-1 text-sm text-quiet">
            Select SIMs (max {BULK_SIM_CAP}), choose an action per row, then Bulk update.
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
                    : "Set an action on every selected SIM"
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
          {!allReady ? " · finish choosing actions on each selected row" : ""}.
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
              <th className="px-4 py-3">Lifecycle / action</th>
              {canChangePlan ? <th className="px-4 py-3">Reseller Plan</th> : null}
            </tr>
          </thead>
          <tbody>
            {sims.map((sim) => {
              const checked = selected.includes(sim.iccid);
              const rowLocked = atCap && !checked;
              const rowStaged = staged[sim.iccid];
              const simState = asSimState(sim.state);
              return (
                <tr key={sim.id} className={`border-t border-line ${rowLocked ? "opacity-40" : ""}`}>
                  {canLifecycle ? (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={rowLocked}
                        onChange={() => toggle(sim.iccid, sim.state)}
                        aria-label={`Select ${sim.iccid}`}
                      />
                    </td>
                  ) : null}
                  {fields.tenantName ? <td className="px-4 py-3">{sim.tenantName ?? "—"}</td> : null}
                  <td className="px-4 py-3 font-mono">{formatIccid(sim.iccid)}</td>
                  <td className="px-4 py-3">{sim.customerName ?? "—"}</td>
                  <td className="px-4 py-3">{sim.planName ?? "—"}</td>
                  {fields.platformPlan ? <td className="px-4 py-3">{sim.platformPlanName ?? "—"}</td> : null}
                  {fields.ccRatePlan ? <td className="px-4 py-3">{sim.wholesalePlan ?? "—"}</td> : null}
                  {fields.ccStatus ? <td className="px-4 py-3">{sim.ccStatus ?? "—"}</td> : null}
                  <td className="px-4 py-3 font-mono">{sim.imsi ?? "—"}</td>
                  <td className="px-4 py-3 font-mono">{sim.msisdn ?? "—"}</td>
                  <td className="px-4 py-3">
                    {sim.currentVolumeMb != null ? `${sim.currentVolumeMb} MB` : "—"}
                  </td>
                  <td className="px-4 py-3">{sim.poolName ?? "—"}</td>
                  <td className="px-4 py-3">{sim.state}</td>
                  <td className="px-4 py-3">
                    {checked && canLifecycle ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <select
                          value={rowStaged?.action ?? ""}
                          onChange={(event) => {
                            const action = event.target.value as BulkItemAction;
                            if (action === "rate_plan") {
                              setRowAction(sim.iccid, {
                                action,
                                platformPlanId:
                                  planOptions.find((p) => p.id !== sim.platformPlanId)?.id ??
                                  planOptions[0]?.id,
                              });
                            } else {
                              setRowAction(sim.iccid, { action });
                            }
                          }}
                          className="rounded-lg border border-line bg-canvas px-2 py-1 text-[11px]"
                        >
                          <option value="" disabled>
                            Choose…
                          </option>
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
                          {canChangePlan ? <option value="rate_plan">Change Reseller Plan</option> : null}
                        </select>
                        {rowStaged?.action === "rate_plan" ? (
                          <select
                            value={rowStaged.platformPlanId ?? ""}
                            onChange={(event) =>
                              setRowAction(sim.iccid, {
                                action: "rate_plan",
                                platformPlanId: event.target.value,
                              })
                            }
                            className="max-w-36 rounded-lg border border-line bg-canvas px-2 py-1 text-[11px]"
                          >
                            {planOptions.length === 0 ? (
                              <option value="">No plans</option>
                            ) : (
                              planOptions.map((plan) => (
                                <option key={plan.id} value={plan.id}>
                                  {plan.label}
                                </option>
                              ))
                            )}
                          </select>
                        ) : null}
                      </div>
                    ) : canLifecycle ? (
                      <LifecycleButtons iccid={sim.iccid} state={sim.state} />
                    ) : (
                      sim.state
                    )}
                  </td>
                  {canChangePlan ? (
                    <td className="px-4 py-3">
                      {checked ? (
                        <span className="text-[11px] text-quiet">Use action column</span>
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
                <div className="space-y-2 text-sm">
                  <p>
                    Push <span className="font-medium text-ink">{selected.length}</span> change
                    {selected.length === 1 ? "" : "s"} (actions can differ per SIM):
                  </p>
                  <ul className="list-inside list-disc text-quiet">
                    {summary.Activate ? <li>Activate · {summary.Activate}</li> : null}
                    {summary.Deactivate ? <li>Deactivate · {summary.Deactivate}</li> : null}
                    {summary.rate_plan ? <li>Reseller Plan · {summary.rate_plan}</li> : null}
                  </ul>
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
                </div>
              )}
            </div>
          }
          confirmLabel={
            job?.status === "completed" ? "Done" : `Run ${selected.length} update${selected.length === 1 ? "" : "s"}`
          }
          tone="accent"
          busy={busy}
          error={error}
          onClose={() => {
            if (busy) return;
            setBulkOpen(false);
            setJob(null);
            setError("");
            if (job?.status === "completed") window.location.reload();
          }}
          onConfirm={() => {
            if (job?.status === "completed") {
              setBulkOpen(false);
              setJob(null);
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
