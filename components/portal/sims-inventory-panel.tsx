"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ChangeRatePlanButton, type RatePlanOption } from "@/components/portal/change-rate-plan-button";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { LifecycleButtons } from "@/components/portal/lifecycle-buttons";
import { formatIccid } from "@/lib/portal/ids";
import { btnPrimary, btnSecondary } from "@/lib/portal/button-styles";
import { BULK_SIM_CAP, type BulkJobKind, type BulkJobStatus } from "@/lib/portal/sim-bulk-shared";

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

type BulkAction = "Activate" | "Deactivate" | "rate_plan";

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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkAction>("Activate");
  const [platformPlanId, setPlatformPlanId] = useState(planOptions[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<BulkJobStatus | null>(null);

  const atCap = selected.length >= BULK_SIM_CAP;
  const selectionActive = selected.length > 0;
  const allSelected = sims.length > 0 && sims.every((sim) => selected.includes(sim.iccid));

  const planLabel = useMemo(
    () => planOptions.find((item) => item.id === platformPlanId)?.label ?? "Reseller Plan",
    [planOptions, platformPlanId],
  );

  function toggle(iccid: string) {
    setSelected((current) => {
      if (current.includes(iccid)) return current.filter((id) => id !== iccid);
      if (current.length >= BULK_SIM_CAP) return current;
      return [...current, iccid];
    });
  }

  function toggleAll() {
    if (allSelected || (atCap && selected.length > 0 && sims.slice(0, BULK_SIM_CAP).every((s) => selected.includes(s.iccid)))) {
      setSelected([]);
      return;
    }
    setSelected(sims.map((sim) => sim.iccid).slice(0, BULK_SIM_CAP));
  }

  function openBulk() {
    if (selected.length === 0) return;
    setError("");
    setJob(null);
    setBulkAction("Activate");
    setPlatformPlanId(planOptions[0]?.id ?? "");
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
    if (selected.length === 0) return;
    if (bulkAction === "rate_plan" && !platformPlanId) {
      setError("Choose a Reseller Plan.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/sims/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: bulkAction as BulkJobKind,
          iccids: selected,
          platformPlanId: bulkAction === "rate_plan" ? platformPlanId : undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; job?: BulkJobStatus };
      if (!res.ok || !data.job) {
        setError(data.error ?? "Bulk update failed.");
        return;
      }
      await runJob(data.job);
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk update failed.");
    } finally {
      setBusy(false);
    }
  }

  const progressPct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
  const confirmLabel =
    bulkAction === "Activate"
      ? `Activate ${selected.length}`
      : bulkAction === "Deactivate"
        ? `Deactivate ${selected.length}`
        : `Apply plan (${selected.length})`;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">SIMs</h1>
          <p className="mt-1 text-sm text-quiet">
            Select SIMs (max {BULK_SIM_CAP}), then Bulk update. Per-row actions pause while a selection is
            active.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {headerLinks}
          {canLifecycle ? (
            <button
              type="button"
              onClick={openBulk}
              disabled={selected.length === 0}
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
          {atCap ? ` · cap ${BULK_SIM_CAP} — further rows greyed out` : ` · max ${BULK_SIM_CAP}`}. Row
          Activate / Deactivate / Change plan disabled until you clear the selection or finish Bulk
          update.
          <button
            type="button"
            className="ml-2 text-accent hover:underline"
            onClick={() => setSelected([])}
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
                    checked={allSelected || (atCap && selected.length > 0 && sims.slice(0, BULK_SIM_CAP).every((s) => selected.includes(s.iccid)))}
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
                    {canLifecycle ? (
                      <LifecycleButtons iccid={sim.iccid} state={sim.state} disabled={selectionActive} />
                    ) : (
                      sim.state
                    )}
                  </td>
                  {canChangePlan ? (
                    <td className="px-4 py-3">
                      <ChangeRatePlanButton
                        iccid={sim.iccid}
                        currentPlatformPlanId={sim.platformPlanId}
                        options={planOptions}
                        disabled={selectionActive}
                      />
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
                <>
                  <p>
                    Apply one change to{" "}
                    <span className="font-medium text-ink">{selected.length}</span> selected SIM
                    {selected.length === 1 ? "" : "s"} (max {BULK_SIM_CAP}).
                  </p>
                  <div className="space-y-2">
                    {(
                      [
                        { id: "Activate" as const, label: "Activate" },
                        { id: "Deactivate" as const, label: "Deactivate" },
                        ...(canChangePlan
                          ? [{ id: "rate_plan" as const, label: "Change Reseller Plan" }]
                          : []),
                      ] as { id: BulkAction; label: string }[]
                    ).map((item) => (
                      <label key={item.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="bulk-action"
                          checked={bulkAction === item.id}
                          onChange={() => setBulkAction(item.id)}
                          disabled={busy}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                  {bulkAction === "rate_plan" ? (
                    planOptions.length === 0 ? (
                      <p className="text-sm text-danger">No contracted Reseller Plans.</p>
                    ) : (
                      <label className="block text-sm">
                        Reseller Plan
                        <select
                          value={platformPlanId}
                          onChange={(event) => setPlatformPlanId(event.target.value)}
                          disabled={busy}
                          className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
                        >
                          {planOptions.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )
                  ) : null}
                </>
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
                  {bulkAction === "rate_plan" ? (
                    <p className="text-xs text-quiet">Target: {planLabel}</p>
                  ) : null}
                </div>
              )}
            </div>
          }
          confirmLabel={job?.status === "completed" ? "Done" : confirmLabel}
          tone={bulkAction === "Deactivate" ? "danger" : "accent"}
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
