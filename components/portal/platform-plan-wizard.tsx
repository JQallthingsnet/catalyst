"use client";

import { useState } from "react";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";

export function PlatformPlanWizard() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [ccRatePlan, setCcRatePlan] = useState("");
  const [commPlan, setCommPlan] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/platform-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ccRatePlan, commPlan }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not create plan.");
        return;
      }
      window.location.assign("/dashboard/plans");
    } catch {
      setError("Could not create plan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardFrame
      title="Create ATN plan"
      steps={["Name", "Network mapping", "Confirm"]}
      step={step}
      summary={
        <>
          <p>{name || "Plan name"}</p>
          <p>CC {ccRatePlan || "rate plan"}</p>
          <p>{commPlan || "communication plan"}</p>
          <p className="text-ok">This is the plan between ATN and the reseller.</p>
        </>
      }
    >
      {step === 0 ? (
        <label className="block text-sm">
          Plan name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Telematics 50 wholesale"
            className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
          />
        </label>
      ) : null}
      {step === 1 ? (
        <div className="space-y-4">
          <label className="block text-sm">
            Control Center rate plan (ATN ↔ CC)
            <input
              value={ccRatePlan}
              onChange={(event) => setCcRatePlan(event.target.value)}
              placeholder="Exactly as it appears in Control Center"
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
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
        <p className="text-sm leading-6 text-quiet">
          Resellers do not see the CC mapping. Assign this plan to a reseller (contract), then sell SIMs into their
          warehouse. They copy it to a retail plan for end customers.
        </p>
      ) : null}
      {error ? <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <WizardActions
        onBack={step > 0 ? () => setStep(step - 1) : undefined}
        onNext={() => {
          if (step < 2) setStep(step + 1);
          else void submit();
        }}
        nextLabel={step < 2 ? "Continue" : "Create plan"}
        busy={busy}
        disabled={!name.trim() || (step >= 1 && (!ccRatePlan.trim() || !commPlan.trim()))}
      />
    </WizardFrame>
  );
}
