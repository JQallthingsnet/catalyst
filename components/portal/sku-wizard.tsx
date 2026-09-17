"use client";

import { useState } from "react";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";
import type { SimSku } from "@/lib/portal/skus";

export function SkuWizard({ sku }: { sku?: SimSku }) {
  const editing = Boolean(sku);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(sku?.name ?? "");
  const [formFactor, setFormFactor] = useState(sku?.formFactor ?? "");
  const [tech, setTech] = useState(sku?.tech ?? "");
  const [region, setRegion] = useState(sku?.region ?? "");
  const [blurb, setBlurb] = useState(sku?.blurb ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/skus", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: sku?.id,
          name,
          formFactor,
          tech,
          region,
          blurb,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save catalogue item.");
        return;
      }
      window.location.assign("/dashboard/catalogue");
    } catch {
      setError("Could not save catalogue item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardFrame
      title={editing ? "Edit SKU" : "Create SKU"}
      steps={["Name", "Product", "Confirm"]}
      step={step}
      summary={
        <>
          <p>{name || "SKU name"}</p>
          <p>{formFactor || "Form factor"}</p>
          <p>
            {tech || "Tech"} · {region || "Region"}
          </p>
          <p className="text-ok">Resellers pick this when they order; you pick it when selling stock.</p>
        </>
      }
    >
      {step === 0 ? (
        <label className="block text-sm">
          SKU name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Nano SIM LTE-M AU"
            className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
          />
        </label>
      ) : null}
      {step === 1 ? (
        <div className="space-y-4">
          <label className="block text-sm">
            Form factor
            <input
              value={formFactor}
              onChange={(event) => setFormFactor(event.target.value)}
              placeholder="Nano, MFF2, eSIM"
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Radio / technology
            <input
              value={tech}
              onChange={(event) => setTech(event.target.value)}
              placeholder="LTE-M, LTE / 5G"
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Region or market
            <input
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              placeholder="Australia, Global"
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Notes
            <input
              value={blurb}
              onChange={(event) => setBlurb(event.target.value)}
              placeholder="Optional. eSIM destination email is required at order if form factor is eSIM."
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
        </div>
      ) : null}
      {step === 2 ? (
        <p className="text-sm leading-6 text-quiet">
          This is a commercial SKU (plastic, industrial, eSIM), not a Control Center rate plan. Sell stock and Order
          SIMs both use this list.
        </p>
      ) : null}
      {error ? <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <WizardActions
        onBack={step > 0 ? () => setStep(step - 1) : undefined}
        onNext={() => {
          if (step < 2) setStep(step + 1);
          else void submit();
        }}
        nextLabel={step < 2 ? "Continue" : editing ? "Save SKU" : "Create SKU"}
        busy={busy}
        disabled={!name.trim() || (step >= 1 && (!formFactor.trim() || !tech.trim() || !region.trim()))}
      />
    </WizardFrame>
  );
}
