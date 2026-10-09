"use client";

import { useMemo, useState } from "react";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";
import type { SimSku } from "@/lib/portal/skus";

type Plan = { id: string; name: string };
type Reseller = {
  id: string;
  name: string;
  planIds: string[];
  defaultPlanId: string;
  adminEmail: string | null;
  ccCustomer: string | null;
};
type CustomerOption = { customer: string; totalCount: number; inWarehouseCount: number };

export function AllocateWizard({
  resellers,
  plans,
  skus,
  customerOptions,
}: {
  resellers: Reseller[];
  plans: Plan[];
  skus: SimSku[];
  customerOptions: CustomerOption[];
}) {
  const [step, setStep] = useState(0);
  const [tenantId, setTenantId] = useState(resellers[0]?.id ?? "");
  const [skuId, setSkuId] = useState<string>(skus[0]?.id ?? "");
  const [platformPlanId, setPlatformPlanId] = useState(resellers[0]?.defaultPlanId ?? "");
  const [ccCustomer, setCcCustomer] = useState(resellers[0]?.ccCustomer ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reseller = resellers.find((item) => item.id === tenantId);
  const sku = skus.find((item) => item.id === skuId);
  const contracted = useMemo(
    () => plans.filter((plan) => reseller?.planIds.includes(plan.id)),
    [plans, reseller],
  );
  const selectedPlanId =
    platformPlanId && contracted.some((plan) => plan.id === platformPlanId)
      ? platformPlanId
      : reseller?.defaultPlanId && contracted.some((plan) => plan.id === reseller.defaultPlanId)
        ? reseller.defaultPlanId
        : (contracted[0]?.id ?? "");
  const plan = contracted.find((item) => item.id === selectedPlanId);

  const lockedCustomer = reseller?.ccCustomer ?? null;
  const effectiveCustomer = lockedCustomer || ccCustomer;
  const availableForSelection = useMemo(() => {
    if (lockedCustomer) {
      return customerOptions.filter(
        (item) => item.customer.toLowerCase() === lockedCustomer.toLowerCase(),
      );
    }
    const boundElsewhere = new Set(
      resellers
        .filter((item) => item.id !== tenantId && item.ccCustomer)
        .map((item) => item.ccCustomer!.toLowerCase()),
    );
    return customerOptions.filter((item) => !boundElsewhere.has(item.customer.toLowerCase()));
  }, [customerOptions, lockedCustomer, resellers, tenantId]);

  const selectedStock = availableForSelection.find(
    (item) => item.customer.toLowerCase() === effectiveCustomer.toLowerCase(),
  );
  const totalForCustomer = selectedStock?.totalCount ?? 0;
  const alreadyInWarehouse = selectedStock?.inWarehouseCount ?? 0;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/wholesale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          skuId,
          platformPlanId: selectedPlanId || plan?.id,
          ccCustomer: effectiveCustomer,
        }),
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
      steps={["Reseller", "Catalogue", "Customer & plan"]}
      step={step}
      summary={
        <>
          <p>{reseller?.name ?? "Choose a reseller"}</p>
          <p className="text-quiet">{reseller?.adminEmail ?? "No reseller admin email"}</p>
          <p>{sku?.name ?? "Choose a SKU"}</p>
          <p>CC customer: {effectiveCustomer || "—"}</p>
          <p>
            {totalForCustomer > 0
              ? `${totalForCustomer.toLocaleString("en-AU")} SIMs · ${plan?.name ?? "No contracted plan"}`
              : plan?.name ?? "No contracted plan"}
          </p>
          <p className="text-ok">
            Bind once — all SIMs with this Jasper customer land in this reseller’s warehouse. Sync keeps adding new
            ones.
          </p>
        </>
      }
    >
      {step === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-quiet">
            Sell stock binds the reseller admin email to a Control Center <span className="text-ink">Customer</span>{" "}
            name. After that, this organisation sees and manages those SIMs only.
          </p>
          {resellers.length === 0 ? <p className="text-sm text-quiet">Create a reseller from Admin first.</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {resellers.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTenantId(item.id);
                  setPlatformPlanId(item.defaultPlanId);
                  setCcCustomer(item.ccCustomer ?? "");
                }}
                className={`rounded-card border p-4 text-left ${
                  tenantId === item.id ? "border-accent bg-panel-2" : "border-line hover:border-accent"
                }`}
              >
                <p className="font-semibold">{item.name}</p>
                <p className="mt-1 text-xs text-quiet">{item.adminEmail ?? "No reseller admin yet"}</p>
                <p className="mt-1 text-xs text-quiet">
                  {item.ccCustomer
                    ? `Bound CC customer: ${item.ccCustomer}`
                    : item.planIds.length
                      ? `${item.planIds.length} contracted rate plan${item.planIds.length === 1 ? "" : "s"}`
                      : "No contract — bind on Contract first"}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-3">
          {skus.length === 0 ? (
            <p className="text-sm text-quiet">Create SKUs in Catalogue first. Super admin owns the product list.</p>
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
            Materialize every SIM with this Jasper <span className="text-ink">Customer</span> into the reseller
            warehouse (any rate plan / status). Binding uses{" "}
            <span className="text-ink">{reseller?.adminEmail ?? "the reseller admin email"}</span>. Later Sync
            auto-warehouses new SIMs for the same customer.
          </p>
          {!reseller?.adminEmail ? (
            <p className="text-sm text-danger">Invite a reseller admin for this organisation before selling stock.</p>
          ) : null}
          <label className="block text-sm">
            Control Center customer
            <select
              value={effectiveCustomer}
              disabled={Boolean(lockedCustomer)}
              onChange={(event) => setCcCustomer(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 disabled:opacity-60"
            >
              <option value="">Select customer…</option>
              {availableForSelection.map((item) => (
                <option key={item.customer} value={item.customer}>
                  {item.customer} · {item.totalCount.toLocaleString("en-AU")} SIMs
                  {item.inWarehouseCount > 0
                    ? ` (${item.inWarehouseCount.toLocaleString("en-AU")} already in Catalyst)`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          {lockedCustomer ? (
            <p className="text-xs text-quiet">
              Already bound — sell stock rematerializes any SIMs still missing from the warehouse.
            </p>
          ) : null}
          {availableForSelection.length === 0 ? (
            <p className="text-sm text-danger">
              No SIMs with a Customer name in the CC snapshot. Set Customer in Jasper, Sync, then return here.
            </p>
          ) : null}
          <label className="block text-sm">
            Default contracted plan (portal stamp — does not filter which SIMs)
            <select
              value={selectedPlanId}
              onChange={(event) => setPlatformPlanId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            >
              {contracted.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.id === reseller?.defaultPlanId ? " · default" : ""}
                </option>
              ))}
            </select>
          </label>
          {effectiveCustomer ? (
            <p className={totalForCustomer > 0 ? "text-sm text-quiet" : "text-sm text-danger"}>
              {totalForCustomer.toLocaleString("en-AU")} SIM{totalForCustomer === 1 ? "" : "s"} for “
              {effectiveCustomer}” in the CC snapshot
              {alreadyInWarehouse > 0
                ? ` · ${alreadyInWarehouse.toLocaleString("en-AU")} already in a warehouse`
                : ""}
              .
            </p>
          ) : null}
          {contracted.length === 0 ? (
            <p className="text-sm text-danger">Bind a rate plan for this reseller on Contract before selling stock.</p>
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
        disabled={
          (step === 0 && (!tenantId || !reseller?.adminEmail)) ||
          (step === 1 && !skuId) ||
          (step === 2 &&
            (!plan || !effectiveCustomer || totalForCustomer < 1 || !reseller?.adminEmail))
        }
      />
    </WizardFrame>
  );
}
