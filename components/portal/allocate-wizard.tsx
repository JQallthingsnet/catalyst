"use client";

import { useMemo, useState } from "react";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";
import type { SimSku } from "@/lib/portal/skus";

type Plan = { id: string; name: string; available: number };
type Reseller = { id: string; name: string; planIds: string[] };

export function AllocateWizard({
  resellers,
  plans,
  skus,
}: {
  resellers: Reseller[];
  plans: Plan[];
  skus: SimSku[];
}) {
  const [step, setStep] = useState(0);
  const [tenantId, setTenantId] = useState(resellers[0]?.id ?? "");
  const [skuId, setSkuId] = useState<string>(skus[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [platformPlanId, setPlatformPlanId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reseller = resellers.find((item) => item.id === tenantId);
  const sku = skus.find((item) => item.id === skuId);
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
          <p>{sku?.name ?? "Choose a SKU"}</p>
          <p>{quantity} SIMs</p>
          <p>{plan?.name ?? "No contracted plan"}</p>
          <p className="text-ok">Free ICCIDs from the Control Center copy land in this reseller warehouse.</p>
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
        <div className="space-y-3">
          {skus.length === 0 ? (
            <p className="text-sm text-quiet">
              Create SKUs in Catalogue first. Super admin owns the product list.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            {skus.map((item) => (
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
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <p className="text-sm text-quiet">
            Quantity takes the oldest unused Control Center SIMs on this ATN plan (Inventory / Ready). Already sold
            ICCIDs are skipped.
          </p>
          <label className="block text-sm">
            Quantity
            <input
              type="number"
              min={1}
              max={Math.max(1, plan?.available ?? 1)}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            ATN plan (this reseller)
            <select
              value={plan?.id ?? ""}
              onChange={(event) => {
                const nextId = event.target.value;
                setPlatformPlanId(nextId);
                const nextPlan = contracted.find((item) => item.id === nextId);
                if (nextPlan) setQuantity((current) => Math.min(Math.max(1, current), Math.max(1, nextPlan.available)));
              }}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            >
              {contracted.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.available.toLocaleString("en-AU")} free in CC
                </option>
              ))}
            </select>
          </label>
          {plan ? (
            <p className={plan.available > 0 ? "text-sm text-quiet" : "text-sm text-danger"}>
              {plan.available.toLocaleString("en-AU")} free SIM{plan.available === 1 ? "" : "s"} on this plan in the CC
              copy.
            </p>
          ) : null}
          {contracted.length === 0 ? (
            <p className="text-sm text-danger">Assign a plan to this reseller on Plans before selling stock.</p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <WizardActions
        onBack={step > 0 ? () => setStep(step - 1) : undefined}
        onNext={() => {
          if (step < 2) {
            if (step === 1 && plan) {
              setQuantity((current) => Math.min(Math.max(1, current), Math.max(1, plan.available)));
            }
            setStep(step + 1);
          } else void submit();
        }}
        nextLabel={step < 2 ? "Continue" : "Sell stock"}
        busy={busy}
        disabled={
          (step === 0 && !tenantId) ||
          (step === 1 && !skuId) ||
          (step === 2 && (!plan || plan.available < 1 || quantity < 1 || quantity > plan.available))
        }
      />
    </WizardFrame>
  );
}
