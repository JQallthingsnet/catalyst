"use client";

import { useState } from "react";
import { COMM_PLANS, SIM_SKUS, WHOLESALE_PLANS } from "@/lib/portal/catalogue";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";

export function AllocateWizard({ resellers }: { resellers: { id: string; name: string }[] }) {
  const [step, setStep] = useState(0);
  const [tenantId, setTenantId] = useState(resellers[0]?.id ?? "");
  const [skuId, setSkuId] = useState<string>(SIM_SKUS[0].id);
  const [quantity, setQuantity] = useState(500);
  const [wholesalePlan, setWholesalePlan] = useState<string>(WHOLESALE_PLANS[0].id);
  const [commPlan, setCommPlan] = useState<string>(COMM_PLANS[0].id);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reseller = resellers.find((item) => item.id === tenantId);
  const sku = SIM_SKUS.find((item) => item.id === skuId)!;
  const wholesale = WHOLESALE_PLANS.find((item) => item.id === wholesalePlan)!;
  const comm = COMM_PLANS.find((item) => item.id === commPlan)!;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/wholesale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, skuId, quantity, wholesalePlan, commPlan }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Allocation failed.");
        return;
      }
      window.location.assign("/dashboard/estate");
    } catch {
      setError("Allocation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardFrame
      title="Sell stock to reseller"
      steps={["Reseller", "Catalogue", "Plan & quantity"]}
      step={step}
      summary={
        <>
          <p>{reseller?.name ?? "Choose a reseller"}</p>
          <p>{sku.name}</p>
          <p>{quantity} SIMs</p>
          <p>
            {wholesale.label} · {comm.label}
          </p>
          <p className="text-ok">ICCIDs land in their warehouse as Ready. They assign to their customers.</p>
        </>
      }
    >
      {step === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-quiet">
            ATN sells SIMs into this reseller’s warehouse. Control Center issues the numbers. The reseller then
            assigns those SIMs to an end customer.
          </p>
          {resellers.length === 0 ? <p className="text-sm text-quiet">Create a reseller from Admin first.</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {resellers.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTenantId(item.id)}
                className={`rounded-card border p-4 text-left ${
                  tenantId === item.id ? "border-accent bg-panel-2" : "border-line hover:border-accent"
                }`}
              >
                <p className="font-semibold">{item.name}</p>
                <p className="mt-1 text-xs text-quiet">{item.id}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {SIM_SKUS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSkuId(item.id)}
              className={`rounded-card border p-4 text-left ${
                skuId === item.id ? "border-accent bg-panel-2" : "border-line hover:border-accent"
              }`}
            >
              <p className="font-semibold">{item.name}</p>
              <p className="mt-2 text-sm text-quiet">
                {item.tech} · {item.region}
              </p>
              <p className="mt-2 text-xs text-quiet">{item.blurb}</p>
            </button>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <label className="block text-sm">
            Quantity
            <input
              type="number"
              min={1}
              max={5000}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Wholesale plan sold to the reseller
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
          <p className="text-sm leading-6 text-quiet">
            Confirm asks Control Center for {quantity} numbers, then puts them in {reseller?.name ?? "the reseller"}{" "}
            as warehouse stock on {wholesale.label}. No end customer is attached yet.
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <WizardActions
        onBack={step > 0 ? () => setStep(step - 1) : undefined}
        onNext={() => {
          if (step < 2) setStep(step + 1);
          else void submit();
        }}
        nextLabel={step < 2 ? "Continue" : "Sell stock"}
        busy={busy}
        disabled={step === 0 && !tenantId}
      />
    </WizardFrame>
  );
}
