"use client";

import { useState } from "react";
import { COMM_PLANS, PLAN_TYPES, WHOLESALE_PLANS } from "@/lib/portal/catalogue";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";

export function PlanWizard() {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<(typeof PLAN_TYPES)[number]>("Telematics");
  const [name, setName] = useState("");
  const [inclusiveMb, setInclusiveMb] = useState(50);
  const [overage, setOverage] = useState("throttle");
  const [roaming, setRoaming] = useState("AU/NZ");
  const [wholesalePlan, setWholesalePlan] = useState("T50");
  const [commPlan, setCommPlan] = useState("data");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, inclusiveMb, overage, roaming, wholesalePlan, commPlan }),
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
      title="Create plan"
      steps={["Type", "Allowances", "Review"]}
      step={step}
      summary={
        <>
          <p>{name}</p>
          <p>Inclusive {inclusiveMb} MB / mo</p>
          <p>Overage: {overage}</p>
          <p>Roaming: {roaming}</p>
          <p>Network plan {wholesalePlan}</p>
        </>
      }
    >
      {step === 0 ? (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {PLAN_TYPES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setType(item)}
                className={`rounded-card border px-4 py-3 text-left ${
                  type === item ? "border-accent bg-panel-2" : "border-line"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="block text-sm">
            Retail plan name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Retail plan name"
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Inclusive MB / month
            <input
              type="number"
              min={1}
              value={inclusiveMb}
              onChange={(event) => setInclusiveMb(Number(event.target.value))}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Overage
            <select
              value={overage}
              onChange={(event) => setOverage(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            >
              <option value="throttle">Throttle</option>
              <option value="block">Block</option>
              <option value="bill">Bill overage</option>
            </select>
          </label>
          <label className="text-sm">
            Roaming
            <input
              value={roaming}
              onChange={(event) => setRoaming(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
          <label className="text-sm">
            ATN-approved network plan
            <select
              value={wholesalePlan}
              onChange={(event) => setWholesalePlan(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            >
              {WHOLESALE_PLANS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
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
          v1 maps this retail plan to an ATN-approved Control Center rate plan and communication plan. It does not
          create a new network rate plan.
        </p>
      ) : null}

      {error ? <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <WizardActions
        onBack={step > 0 ? () => setStep(step - 1) : undefined}
        onNext={() => {
          if (step < 2) setStep(step + 1);
          else void submit();
        }}
        nextLabel={step < 2 ? "Continue" : "Publish plan"}
        busy={busy}
        disabled={!name.trim()}
      />
    </WizardFrame>
  );
}
