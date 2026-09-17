"use client";

import { useState } from "react";
import { COMM_PLANS, WHOLESALE_PLANS } from "@/lib/portal/catalogue";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";

export function PlatformPlanWizard() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [ccRatePlan, setCcRatePlan] = useState<string>(WHOLESALE_PLANS[0].id);
  const [commPlan, setCommPlan] = useState<string>(COMM_PLANS[0].id);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const cc = WHOLESALE_PLANS.find((item) => item.id === ccRatePlan)!;
  const comm = COMM_PLANS.find((item) => item.id === commPlan)!;

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
          <p>CC {cc.label}</p>
          <p>{comm.label}</p>
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
            <select
              value={ccRatePlan}
              onChange={(event) => setCcRatePlan(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            >
              {WHOLESALE_PLANS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Communication plan
            <select
              value={commPlan}
              onChange={(event) => setCommPlan(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            >
              {COMM_PLANS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
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
        disabled={!name.trim()}
      />
    </WizardFrame>
  );
}
