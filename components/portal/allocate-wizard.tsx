"use client";

import { useMemo, useState } from "react";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";

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
  customerOptions,
}: {
  resellers: Reseller[];
  plans: Plan[];
  customerOptions: CustomerOption[];
}) {
  const unbound = useMemo(() => resellers.filter((item) => !item.ccCustomer), [resellers]);
  const [step, setStep] = useState(0);
  const [tenantId, setTenantId] = useState(unbound[0]?.id ?? "");
  const [platformPlanId, setPlatformPlanId] = useState(unbound[0]?.defaultPlanId ?? "");
  const [ccCustomer, setCcCustomer] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reseller = resellers.find((item) => item.id === tenantId);
  const alreadyBound = Boolean(reseller?.ccCustomer);
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

  const availableForSelection = useMemo(() => {
    const boundElsewhere = new Set(
      resellers
        .filter((item) => item.id !== tenantId && item.ccCustomer)
        .map((item) => item.ccCustomer!.toLowerCase()),
    );
    return customerOptions.filter((item) => !boundElsewhere.has(item.customer.toLowerCase()));
  }, [customerOptions, resellers, tenantId]);

  const selectedStock = availableForSelection.find(
    (item) => item.customer.toLowerCase() === ccCustomer.toLowerCase(),
  );
  const totalForCustomer = selectedStock?.totalCount ?? 0;

  async function submit() {
    if (alreadyBound) {
      setError(
        "Sell stock already completed for this organisation. New SIMs arrive via Sync; change Reseller Plan on SIMs.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/wholesale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          platformPlanId: selectedPlanId || plan?.id,
          ccCustomer,
          poNumber,
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
      steps={["Reseller", "Customer & plan"]}
      step={step}
      summary={
        <>
          <p>{reseller?.name ?? "Choose a reseller"}</p>
          <p className="text-quiet">{reseller?.adminEmail ?? "No reseller admin email"}</p>
          <p>CC customer: {ccCustomer || "—"}</p>
          <p>PO: {poNumber.trim() || "—"}</p>
          <p>
            {totalForCustomer > 0
              ? `${totalForCustomer.toLocaleString("en-AU")} SIMs · default ${plan?.name ?? "—"}`
              : plan?.name ?? "No contracted plan"}
          </p>
          <p className="text-ok">
            One-time bind. Reseller Plan is taken from Jasper modem_ID on first import; later plan changes stay in
            Catalyst. Sync adds new SIMs for the same Customer.
          </p>
        </>
      }
    >
      {step === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-quiet">
            Sell stock runs <span className="text-ink">once</span> per organisation: bind a Control Center{" "}
            <span className="text-ink">Customer</span> and import SIMs. After that, Sync brings new SIMs; Reseller
            Plan changes are done on SIMs in Catalyst.
          </p>
          {resellers.length === 0 ? <p className="text-sm text-quiet">Create a reseller from Admin first.</p> : null}
          {unbound.length === 0 && resellers.length > 0 ? (
            <p className="rounded-xl border border-line px-3 py-3 text-sm text-quiet">
              Every reseller is already bound. Open Estate for an organisation, or use Sync for new SIMs.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {resellers.map((item) => {
              const bound = Boolean(item.ccCustomer);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={bound}
                  onClick={() => {
                    if (bound) return;
                    setTenantId(item.id);
                    setPlatformPlanId(item.defaultPlanId);
                    setCcCustomer("");
                  }}
                  className={`rounded-card border p-4 text-left ${
                    bound
                      ? "cursor-not-allowed border-line opacity-50"
                      : tenantId === item.id
                        ? "border-accent bg-panel-2"
                        : "border-line hover:border-accent"
                  }`}
                >
                  <p className="font-semibold">{item.name}</p>
                  <p className="mt-1 text-xs text-quiet">{item.adminEmail ?? "No reseller admin yet"}</p>
                  <p className="mt-1 text-xs text-quiet">
                    {bound
                      ? `Already bound · ${item.ccCustomer}`
                      : item.planIds.length
                        ? `${item.planIds.length} contracted Reseller Plan${item.planIds.length === 1 ? "" : "s"}`
                        : "No contract — bind on Contract first"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          {alreadyBound ? (
            <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              This organisation is already bound to “{reseller?.ccCustomer}”. Sell stock cannot run again. New SIMs
              for that Customer are added by Sync; change Reseller Plan on the SIMs page.
            </p>
          ) : (
            <p className="text-sm text-quiet">
              Import every SIM with this Jasper <span className="text-ink">Customer</span>. Prefer{" "}
              <span className="text-ink">modem_ID</span> as Reseller Plan (mirrored as-is). If modem_ID is still empty
              at bind time, use Supplier code / contract default below — Sync details later remirror once when
              modem_ID arrives (until you Change plan). Binding uses{" "}
              <span className="text-ink">{reseller?.adminEmail ?? "the reseller admin email"}</span>.
            </p>
          )}
          {!reseller?.adminEmail ? (
            <p className="text-sm text-danger">Invite a reseller admin for this organisation before selling stock.</p>
          ) : null}
          <label className="block text-sm">
            Control Center customer
            <select
              value={ccCustomer}
              disabled={alreadyBound}
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
          {availableForSelection.length === 0 ? (
            <p className="text-sm text-danger">
              No SIMs with a Customer name in the CC snapshot. Set Customer in Jasper, Sync, then return here.
            </p>
          ) : null}
          <label className="block text-sm">
            Contract default Reseller Plan
            <span className="mt-1 block text-xs font-normal text-quiet">
              Used only when Jasper modem_ID is blank (after Supplier-code match fails).
            </span>
            <select
              value={selectedPlanId}
              disabled={alreadyBound}
              onChange={(event) => setPlatformPlanId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 disabled:opacity-60"
            >
              {contracted.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.id === reseller?.defaultPlanId ? " · default" : ""}
                </option>
              ))}
            </select>
          </label>
          {ccCustomer && !alreadyBound ? (
            <p className={totalForCustomer > 0 ? "text-sm text-quiet" : "text-sm text-danger"}>
              {totalForCustomer.toLocaleString("en-AU")} SIM{totalForCustomer === 1 ? "" : "s"} for “
              {ccCustomer}” in the CC snapshot.
            </p>
          ) : null}
          {contracted.length === 0 ? (
            <p className="text-sm text-danger">
              Bind a Reseller Plan for this reseller on Contract before selling stock.
            </p>
          ) : null}
          <label className="block text-sm">
            PO number <span className="text-quiet">(optional)</span>
            <input
              value={poNumber}
              disabled={alreadyBound}
              onChange={(event) => setPoNumber(event.target.value)}
              maxLength={64}
              placeholder="Purchase order reference"
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 disabled:opacity-60"
            />
          </label>
        </div>
      ) : null}

      {error ? <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <WizardActions
        onBack={step > 0 ? () => setStep(step - 1) : undefined}
        onNext={() => {
          if (step < 1) setStep(step + 1);
          else void submit();
        }}
        nextLabel={step < 1 ? "Continue" : "Sell stock (once)"}
        busy={busy}
        disabled={
          alreadyBound ||
          unbound.length === 0 ||
          (step === 0 && (!tenantId || !reseller?.adminEmail || alreadyBound)) ||
          (step === 1 &&
            (!plan || !ccCustomer || totalForCustomer < 1 || !reseller?.adminEmail || alreadyBound))
        }
      />
    </WizardFrame>
  );
}
