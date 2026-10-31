"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";
import type { SimState } from "@/lib/portal/catalogue";
import { formatIccid } from "@/lib/portal/ids";
import { BULK_SIM_CAP, type BulkJobKind, type BulkJobStatus } from "@/lib/portal/sim-bulk-shared";

type PlanOption = { id: string; name: string };
type SimRow = {
  iccid: string;
  state: string;
  planName: string | null;
  platformPlanName: string | null;
  customerName: string | null;
};

const STATES: SimState[] = ["Ready", "Active", "Deactivated"];

type ActionKind = "Activate" | "Deactivate" | "rate_plan";

export function BulkUpdateWizard({
  sims,
  platformPlans,
  canChangePlan,
}: {
  sims: SimRow[];
  platformPlans: PlanOption[];
  canChangePlan: boolean;
}) {
  const [step, setStep] = useState(0);
  const [action, setAction] = useState<ActionKind>("Activate");
  const [platformPlanId, setPlatformPlanId] = useState(platformPlans[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [iccidQuery, setIccidQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<Set<SimState>>(() => new Set(STATES));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<BulkJobStatus | null>(null);

  const plan = platformPlans.find((item) => item.id === platformPlanId);

  const filtered = useMemo(() => {
    const q = iccidQuery.replace(/\s/g, "");
    return sims.filter((sim) => {
      if (!stateFilter.has(sim.state as SimState)) return false;
      if (q && !sim.iccid.includes(q)) return false;
      return true;
    });
  }, [sims, stateFilter, iccidQuery]);

  const selectableFiltered = filtered.slice(0, BULK_SIM_CAP);
  const allFilteredSelected =
    selectableFiltered.length > 0 &&
    selectableFiltered.every((sim) => selected.includes(sim.iccid));

  const nextDisabled =
    step === 0
      ? action === "rate_plan" && !platformPlanId
      : step === 1
        ? selected.length === 0
        : Boolean(job && (job.status === "queued" || job.status === "running"));

  function toggleState(state: SimState) {
    setStateFilter((current) => {
      const next = new Set(current);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  }

  function toggle(iccid: string) {
    setSelected((current) => {
      if (current.includes(iccid)) return current.filter((item) => item !== iccid);
      if (current.length >= BULK_SIM_CAP) return current;
      return [...current, iccid];
    });
  }

  function toggleAllFiltered() {
    const ids = selectableFiltered.map((sim) => sim.iccid);
    setSelected((current) => {
      if (ids.length === 0) return current;
      if (ids.every((id) => current.includes(id))) return [];
      return ids;
    });
  }

  async function runJob(created: BulkJobStatus) {
    let current = created;
    setJob(current);
    while (current.status !== "completed" && current.status !== "failed") {
      const res = await fetch(`/api/portal/sims/bulk/${current.id}`, { method: "POST" });
      const data = (await res.json()) as { error?: string; job?: BulkJobStatus };
      if (!res.ok || !data.job) {
        throw new Error(data.error ?? "Bulk process failed.");
      }
      current = data.job;
      setJob(current);
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/sims/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: action as BulkJobKind,
          iccids: selected,
          platformPlanId: action === "rate_plan" ? platformPlanId : undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; job?: BulkJobStatus };
      if (!res.ok || !data.job) {
        setError(data.error ?? "Bulk update failed.");
        return;
      }
      await runJob(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk update failed.");
    } finally {
      setBusy(false);
    }
  }

  const actionLabel =
    action === "rate_plan" ? `Change plan${plan ? ` · ${plan.name}` : ""}` : action;

  const progressPct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <WizardFrame
      title="Bulk update"
      steps={["Action", "SIMs", "Confirm"]}
      step={step}
      summary={
        <>
          <p>{actionLabel}</p>
          <p>
            {selected.length} SIM{selected.length === 1 ? "" : "s"}
            <span className="text-quiet"> · max {BULK_SIM_CAP}</span>
          </p>
          {job ? (
            <p className="text-ok">
              {job.done}/{job.total} · {job.okCount} ok
              {job.failedCount ? ` · ${job.failedCount} failed` : ""}
            </p>
          ) : (
            <p className="text-ok">Background job · progress on confirm</p>
          )}
        </>
      }
    >
      {step === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-quiet">
            Update up to {BULK_SIM_CAP} SIMs in one run. Activate / Deactivate push to Jasper; Reseller
            Plan updates Catalyst billing.
          </p>
          {(
            [
              { id: "Activate" as const, label: "Activate", blurb: "Push ACTIVATED to Jasper." },
              { id: "Deactivate" as const, label: "Deactivate", blurb: "Push DEACTIVATED to Jasper." },
              ...(canChangePlan
                ? [
                    {
                      id: "rate_plan" as const,
                      label: "Change Reseller Plan",
                      blurb: "Pick a contracted plan for the selected SIMs.",
                    },
                  ]
                : []),
            ] as { id: ActionKind; label: string; blurb: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setAction(item.id)}
              className={`block w-full rounded-card border px-4 py-3 text-left ${
                action === item.id ? "border-accent bg-panel-2" : "border-line"
              }`}
            >
              <span className="font-medium text-ink">{item.label}</span>
              <span className="mt-1 block text-xs text-quiet">{item.blurb}</span>
            </button>
          ))}

          {action === "rate_plan" ? (
            platformPlans.length === 0 ? (
              <p className="text-sm text-danger">No contracted Reseller Plans. Ask ATN to assign a contract.</p>
            ) : (
              <label className="block text-sm">
                Reseller Plan
                <select
                  value={platformPlanId}
                  onChange={(event) => setPlatformPlanId(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
                >
                  {platformPlans.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <div className="space-y-3 rounded-card border border-line bg-canvas/40 p-3">
            <label className="block text-sm">
              ICCID contains
              <input
                value={iccidQuery}
                onChange={(event) => setIccidQuery(event.target.value)}
                placeholder="Filter by digits…"
                className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 font-mono text-sm"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {STATES.map((state) => {
                const on = stateFilter.has(state);
                return (
                  <button
                    key={state}
                    type="button"
                    onClick={() => toggleState(state)}
                    className={`rounded-full px-3 py-1 text-xs ${
                      on ? "bg-accent text-accent-ink" : "border border-line text-quiet"
                    }`}
                  >
                    {state}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-quiet">
              {filtered.length === sims.length
                ? `${sims.length} SIMs — filter, then tick up to ${BULK_SIM_CAP}.`
                : `Showing ${filtered.length} of ${sims.length}. Select all takes the first ${BULK_SIM_CAP} matches.`}
              {selected.length >= BULK_SIM_CAP ? (
                <span className="text-ink"> Cap reached ({BULK_SIM_CAP}).</span>
              ) : null}
            </p>
          </div>

          <div className="max-h-72 overflow-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-quiet">No SIMs match these filters.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-quiet">
                  <tr>
                    <th className="pb-2">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleAllFiltered}
                        aria-label="Select all visible (max 100)"
                      />
                    </th>
                    <th className="pb-2">ICCID</th>
                    <th className="pb-2">Customer</th>
                    <th className="pb-2">Reseller Plan</th>
                    <th className="pb-2">State</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sim) => {
                    const checked = selected.includes(sim.iccid);
                    const blocked = !checked && selected.length >= BULK_SIM_CAP;
                    return (
                      <tr key={sim.iccid} className="border-t border-line">
                        <td className="py-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={blocked}
                            onChange={() => toggle(sim.iccid)}
                          />
                        </td>
                        <td className="py-2 font-mono">{formatIccid(sim.iccid)}</td>
                        <td className="py-2 text-quiet">{sim.customerName ?? "—"}</td>
                        <td className="py-2 text-quiet">{sim.platformPlanName ?? "—"}</td>
                        <td className="py-2">{sim.state}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          {!job ? (
            <p className="text-sm leading-6 text-quiet">
              Confirm runs a background job for{" "}
              <span className="font-medium text-ink">{selected.length}</span> SIM
              {selected.length === 1 ? "" : "s"}: <span className="font-medium text-ink">{actionLabel}</span>.
              You can watch progress below; one digest email goes to Alerts recipients when finished.
            </p>
          ) : null}

          {job ? (
            <div className="space-y-3">
              <div className="h-2 overflow-hidden rounded-full bg-panel-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-sm text-ink">
                {job.status === "completed"
                  ? `Finished — ${job.okCount} ok${job.failedCount ? `, ${job.failedCount} failed` : ""}.`
                  : `Working… ${job.done} of ${job.total}`}
              </p>
              {job.status === "completed" ? (
                <Link href="/dashboard/sims" className="inline-flex text-sm text-accent hover:underline">
                  Back to inventory
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}

      {!(job && job.status === "completed") ? (
        <WizardActions
          onBack={step > 0 && !busy && !job ? () => setStep(step - 1) : undefined}
          onNext={() => {
            if (step < 2) setStep(step + 1);
            else void submit();
          }}
          nextLabel={
            step < 2
              ? "Continue"
              : action === "Activate"
                ? `Activate ${selected.length}`
                : action === "Deactivate"
                  ? `Deactivate ${selected.length}`
                  : `Apply plan (${selected.length})`
          }
          busy={busy}
          disabled={nextDisabled || (action === "rate_plan" && platformPlans.length === 0)}
        />
      ) : null}
    </WizardFrame>
  );
}
