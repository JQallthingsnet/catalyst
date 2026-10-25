"use client";

import { useState } from "react";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";
import type { SimSku } from "@/lib/portal/skus";

export function OrderWizard({ skus }: { skus: SimSku[] }) {
  const [step, setStep] = useState(0);
  const [skuId, setSkuId] = useState<string>(skus[0]?.id ?? "");
  const [quantity, setQuantity] = useState(100);
  const [logistics, setLogistics] = useState("Warehouse AU");
  const [destination, setDestination] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const sku = skus.find((item) => item.id === skuId);
  const esim = Boolean(sku?.formFactor.toLowerCase().includes("esim"));

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuId,
          quantity,
          logistics,
          destination: esim ? destination : logistics,
          poNumber,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Order failed.");
        return;
      }
      window.location.assign("/dashboard/orders");
    } catch {
      setError("Order failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardFrame
      title="Order SIMs"
      steps={["Catalogue", "Quantity", "Confirm"]}
      step={step}
      summary={
        <>
          <p>{sku?.name ?? "Choose a SKU"}</p>
          <p>{quantity} units</p>
          <p>{esim ? destination || "eSIM destination" : logistics}</p>
          <p>PO: {poNumber.trim() || "—"}</p>
          <p className="text-ok">Submitted to this tenant. ICCIDs come from Control Center, not a local reservation.</p>
        </>
      }
    >
      {step === 0 ? (
        <div className="space-y-3">
          {skus.length === 0 ? (
            <p className="text-sm text-quiet">No SKUs yet. Ask a super admin to create them in Catalogue.</p>
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
                {item.blurb ? <p className="mt-2 text-xs text-quiet">{item.blurb}</p> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <label className="block text-sm">
            Quantity
            <input
              type="number"
              min={1}
              max={500}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
          {esim ? (
            <label className="block text-sm">
              eSIM destination email
              <input
                type="email"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
              />
            </label>
          ) : (
            <label className="block text-sm">
              Shipping / warehouse
              <input
                value={logistics}
                onChange={(event) => setLogistics(event.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
              />
            </label>
          )}
          <label className="block text-sm">
            PO number <span className="text-quiet">(optional)</span>
            <input
              value={poNumber}
              onChange={(event) => setPoNumber(event.target.value)}
              maxLength={64}
              placeholder="Purchase order reference"
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-2 text-sm leading-6 text-quiet">
          <p>
            Submit an order for <strong className="text-ink">{sku?.name}</strong>. ATN fulfils plastic SIMs by
            courier to the shipping address, or eSIMs by provision to the destination email. ICCIDs still come from
            Control Center after ATN loads them.
          </p>
          <p>
            Status path: Submitted → Accepted → Shipped → Received. You can revoke while Submitted; after Accept only
            ATN can cancel.
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
        nextLabel={step < 2 ? "Continue" : "Confirm order"}
        busy={busy}
        disabled={!sku || (esim && step === 1 && !destination)}
      />
    </WizardFrame>
  );
}
