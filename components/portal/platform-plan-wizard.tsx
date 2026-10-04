"use client";

import { useState } from "react";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";
import { PLAN_SUPPLIERS } from "@/lib/portal/plan-suppliers";

export function PlatformPlanWizard({
  resellers,
  returnTo = "/dashboard/plans",
}: {
  resellers: { id: string; name: string }[];
  returnTo?: string;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [supplier, setSupplier] = useState<string>(PLAN_SUPPLIERS[0]);
  const [ccRatePlan, setCcRatePlan] = useState("");
  const [commPlan, setCommPlan] = useState("");
  const [resellerIds, setResellerIds] = useState<string[]>(resellers[0] ? [resellers[0].id] : []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function toggleReseller(id: string) {
    setResellerIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/platform-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, supplier, ccRatePlan, commPlan, resellerIds }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not create plan.");
        return;
      }
      window.location.assign(returnTo);
    } catch {
      setError("Could not create plan.");
    } finally {
      setBusy(false);
    }
  }

  const boundNames = resellers.filter((item) => resellerIds.includes(item.id)).map((item) => item.name);

  return (
    <WizardFrame
      title="Create ATN plan"
      steps={["Remarks", "Supplier mapping", "Bind resellers", "Confirm"]}
      step={step}
      summary={
        <>
          <p>{name || "Remarks"}</p>
          <p>
            {supplier || "Supplier"} · {ccRatePlan || "rate plan"}
          </p>
          <p>{commPlan || "communication plan"}</p>
          <p>{boundNames.length ? boundNames.join(", ") : "No reseller bound"}</p>
          <p className="text-ok">Appears on Contract for bound resellers and on Plans with supplier mapping.</p>
        </>
      }
    >
      {step === 0 ? (
        <label className="block text-sm">
          Remarks (commercial description on the contract)
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. 1GB · Lift plan, 50MB+50SMS"
            className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
          />
        </label>
      ) : null}
      {step === 1 ? (
        <div className="space-y-4">
          <label className="block text-sm">
            Supplier
            <select
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            >
              {PLAN_SUPPLIERS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Rate plan
            <input
              value={ccRatePlan}
              onChange={(event) => setCcRatePlan(event.target.value)}
              placeholder="e.g. CM1GB, Optus / Jasper TCode"
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
            <span className="mt-1 block text-xs text-quiet">
              Must match the supplier’s rate plan name (for Optus, the Jasper rate plan / TCode).
            </span>
          </label>
          <label className="block text-sm">
            Communication plan
            <input
              value={commPlan}
              onChange={(event) => setCommPlan(event.target.value)}
              placeholder="e.g. Data only"
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
        </div>
      ) : null}
      {step === 2 ? (
        <div className="space-y-3">
          <p className="text-sm text-quiet">
            Bind the resellers who have this line on contract. Only they will see it under Contract.
          </p>
          {resellers.length === 0 ? (
            <p className="rounded-xl border border-line px-3 py-3 text-sm text-danger">
              Create a reseller organisation from Admin before creating a contracted plan.
            </p>
          ) : (
            <ul className="space-y-2">
              {resellers.map((item) => {
                const checked = resellerIds.includes(item.id);
                return (
                  <li key={item.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                        checked ? "border-accent bg-panel-2" : "border-line"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleReseller(item.id)}
                        className="accent-accent"
                      />
                      {item.name}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
      {step === 3 ? (
        <p className="text-sm leading-6 text-quiet">
          This creates one ATN plan (visible under Plans with the supplier mapping) and adds it to Contract for the
          bound reseller(s). Reseller admins can refer to Contract; they create retail plans from Plans.
        </p>
      ) : null}
      {error ? <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <WizardActions
        onBack={step > 0 ? () => setStep(step - 1) : undefined}
        onNext={() => {
          if (step < 3) setStep(step + 1);
          else void submit();
        }}
        nextLabel={step < 3 ? "Continue" : "Create plan"}
        busy={busy}
        disabled={
          !name.trim() ||
          (step >= 1 && (!supplier.trim() || !ccRatePlan.trim() || !commPlan.trim())) ||
          (step >= 2 && resellerIds.length === 0)
        }
      />
    </WizardFrame>
  );
}
