"use client";

import { useMemo, useState } from "react";
import { SIM_SKUS } from "@/lib/portal/catalogue";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";

type Plan = { id: string; name: string };
type Reseller = { id: string; name: string; planIds: string[] };

export function AllocateWizard({
  resellers,
  plans,
}: {
  resellers: Reseller[];
  plans: Plan[];
}) {
  const [step, setStep] = useState(0);
  const [tenantId, setTenantId] = useState(resellers[0]?.id ?? "");
  const [skuId, setSkuId] = useState<string>(SIM_SKUS[0].id);
  const [quantity, setQuantity] = useState(500);
  const [platformPlanId, setPlatformPlanId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reseller = resellers.find((item) => item.id === tenantId);
  const sku = SIM_SKUS.find((item) => item.id === skuId)!;
  const contracted = useMemo(
    () => plans.filter((plan) => reseller?.planIds.includes(plan.id)),
    [plans, reseller],
  );
  const plan = contracted.find((item) => item.id === platformPlanId) ?? contracted[0];

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/wholesale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, skuId, quantity, platformPlanId: plan?.id }),
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
          <p>{plan?.name ?? "No contracted plan"}</p>
          <p className="text-ok">SIMs land in warehouse on this ATN plan.</p>
        </>
      }
    >
      {step === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-quiet">
            Only resellers with a signed plan assignment (contract) can receive stock. Each SIM will carry that ATN
            plan.
          </p>
          {resellers.length === 0 ? <p className="text-sm text-quiet">Create a reseller from Admin first.</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {resellers.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTenantId(item.id);
                  setPlatformPlanId("");
                }}
                className={`rounded-card border p-4 text-left ${
                  tenantId === item.id ? "border-accent bg-panel-2" : "border-line hover:border-accent"
                }`}
              >
                <p className="font-semibold">{item.name}</p>
                <p className="mt-1 text-xs text-quiet">
                  {item.planIds.length} contracted plan{item.planIds.length === 1 ? "" : "s"}
                </p>
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
            ATN plan (this reseller)
            <select
              value={plan?.id ?? ""}
              onChange={(event) => setPlatformPlanId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            >
              {contracted.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {contracted.length === 0 ? (
            <p className="text-sm text-danger">Assign a plan to this reseller on Plans before selling stock.</p>
          ) : null}
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
        disabled={(step === 0 && !tenantId) || (step === 2 && !plan)}
      />
    </WizardFrame>
  );
}
