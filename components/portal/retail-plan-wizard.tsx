"use client";

import { useState } from "react";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";

export function RetailPlanWizard({
  platformPlans,
}: {
  platformPlans: { id: string; name: string }[];
}) {
  const [step, setStep] = useState(0);
  const [platformPlanId, setPlatformPlanId] = useState(platformPlans[0]?.id ?? "");
  const [name, setName] = useState("");
  const [inclusiveMb, setInclusiveMb] = useState(50);
  const [pricePerSim, setPricePerSim] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const parent = platformPlans.find((item) => item.id === platformPlanId);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, platformPlanId, inclusiveMb, pricePerSim }),
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
      title="Copy to retail plan"
      steps={["ATN plan", "Name, data, price", "Confirm"]}
      step={step}
      summary={
        <>
          <p>From {parent?.name ?? "—"}</p>
          <p>{name || "Retail name"}</p>
          <p>{inclusiveMb} MB / SIM</p>
          <p>${pricePerSim} / SIM</p>
        </>
      }
    >
      {step === 0 ? (
        <div className="space-y-2">
          {platformPlans.length === 0 ? (
            <p className="text-sm text-quiet">No ATN plan is contracted to this organisation yet.</p>
          ) : (
            platformPlans.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPlatformPlanId(item.id)}
                className={`block w-full rounded-card border px-4 py-3 text-left ${
                  platformPlanId === item.id ? "border-accent bg-panel-2" : "border-line"
                }`}
              >
                {item.name}
              </button>
            ))
          )}
        </div>
      ) : null}
      {step === 1 ? (
        <div className="space-y-4">
          <label className="block text-sm">
            Retail plan name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name sold to the end customer"
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Data allowance per SIM (MB / month)
            <input
              type="number"
              min={1}
              value={inclusiveMb}
              onChange={(event) => setInclusiveMb(Number(event.target.value))}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Price per SIM
            <input
              type="number"
              min={0}
              step="0.01"
              value={pricePerSim}
              onChange={(event) => setPricePerSim(Number(event.target.value))}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
        </div>
      ) : null}
      {step === 2 ? (
        <p className="text-sm leading-6 text-quiet">
          Operators will pick this retail plan when they assign a SIM to a customer. The ATN contract plan stays on
          the SIM; they will not see it.
        </p>
      ) : null}
      {error ? <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <WizardActions
        onBack={step > 0 ? () => setStep(step - 1) : undefined}
        onNext={() => {
          if (step < 2) setStep(step + 1);
          else void submit();
        }}
        nextLabel={step < 2 ? "Continue" : "Create retail plan"}
        busy={busy}
        disabled={!platformPlanId || (step >= 1 && !name.trim())}
      />
    </WizardFrame>
  );
}
