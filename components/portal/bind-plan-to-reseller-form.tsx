"use client";

import { CatalogueSkuMultiSelect } from "@/components/portal/catalogue-sku-multi-select";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function BindPlanToResellerForm({
  tenantId,
  plans,
  catalogueSkus,
  hasCatalogue,
}: {
  tenantId: string;
  plans: { id: string; ratePlanNew: string; remarks: string }[];
  catalogueSkus: { id: string; name: string; formFactor: string; active?: boolean }[];
  /** Reseller already has at least one catalogue SKU on contract. */
  hasCatalogue: boolean;
}) {
  const router = useRouter();
  const [pickedPlanId, setPickedPlanId] = useState("");
  const unboundSkus = catalogueSkus; // when needsCatalogue, all active options are choosable
  const [selectedSkuIds, setSelectedSkuIds] = useState<string[]>(() =>
    !hasCatalogue && unboundSkus[0] ? [unboundSkus[0].id] : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const platformPlanId = useMemo(() => {
    if (plans.some((plan) => plan.id === pickedPlanId)) return pickedPlanId;
    return plans[0]?.id ?? "";
  }, [plans, pickedPlanId]);

  const needsCatalogue = !hasCatalogue;
  const canSubmit =
    Boolean(platformPlanId) && (!needsCatalogue || selectedSkuIds.length > 0) && !busy;

  if (plans.length === 0) {
    return (
      <p className="text-xs text-quiet">
        All active rate plans are already bound.{" "}
        <a href="/dashboard/plans/new?from=contract" className="text-accent">
          Create Rate Plan
        </a>{" "}
        to add another.
      </p>
    );
  }

  if (needsCatalogue && unboundSkus.length === 0) {
    return (
      <p className="text-xs text-danger">
        Create a catalogue SKU first — a rate plan must be bound with at least one catalogue product.{" "}
        <a href="/dashboard/catalogue" className="text-accent">
          Catalogue
        </a>
      </p>
    );
  }

  async function submit() {
    if (!platformPlanId) {
      setError("Choose a rate plan.");
      return;
    }
    if (needsCatalogue && selectedSkuIds.length === 0) {
      setError("Select at least one catalogue SKU.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/platform-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          platformPlanId,
          skuIds: selectedSkuIds,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not bind plan.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not bind plan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={platformPlanId}
          onChange={(event) => setPickedPlanId(event.target.value)}
          className="min-w-48 rounded-xl border border-line bg-canvas px-2 py-1.5 text-xs"
        >
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.ratePlanNew} — {plan.remarks}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink disabled:opacity-40"
        >
          {busy ? "Binding…" : needsCatalogue ? "Bind plan + catalogue" : "Add rate plan"}
        </button>
      </div>

      {needsCatalogue ? (
        <CatalogueSkuMultiSelect
          label="Tick catalogue SKUs to bind with this rate plan"
          options={unboundSkus}
          selectedIds={selectedSkuIds}
          onChange={setSelectedSkuIds}
          disabled={busy}
          placeholder="Select catalogue SKUs"
        />
      ) : (
        <p className="text-xs text-quiet">Catalogue already on this contract — you can add the rate plan now.</p>
      )}

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </form>
  );
}
