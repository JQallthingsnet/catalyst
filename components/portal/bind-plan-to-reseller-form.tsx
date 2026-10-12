"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function BindPlanToResellerForm({
  tenantId,
  plans,
  unboundSkus,
  hasCatalogue,
}: {
  tenantId: string;
  plans: { id: string; ratePlanNew: string; remarks: string }[];
  unboundSkus: { id: string; name: string; formFactor: string }[];
  /** Reseller already has at least one catalogue SKU on contract. */
  hasCatalogue: boolean;
}) {
  const router = useRouter();
  const [platformPlanId, setPlatformPlanId] = useState(plans[0]?.id ?? "");
  const [selectedSkuIds, setSelectedSkuIds] = useState<string[]>(() =>
    !hasCatalogue && unboundSkus[0] ? [unboundSkus[0].id] : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const needsCatalogue = !hasCatalogue;
  const canSubmit = useMemo(() => {
    if (!platformPlanId) return false;
    if (needsCatalogue && selectedSkuIds.length === 0) return false;
    return true;
  }, [platformPlanId, needsCatalogue, selectedSkuIds.length]);

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

  function toggleSku(id: string) {
    setSelectedSkuIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function submit() {
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
          onChange={(event) => setPlatformPlanId(event.target.value)}
          className="rounded-xl border border-line bg-canvas px-2 py-1.5 text-xs"
        >
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.ratePlanNew} — {plan.remarks}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || !canSubmit}
          className="rounded-full border border-line px-3 py-1.5 text-xs text-ink hover:border-accent disabled:opacity-40"
        >
          {busy ? "Binding…" : needsCatalogue ? "Bind plan + catalogue" : "Add rate plan"}
        </button>
      </div>

      {unboundSkus.length > 0 ? (
        <fieldset className="space-y-1.5">
          <legend className="text-xs text-quiet">
            {needsCatalogue
              ? "Catalogue SKUs required (select one or more)"
              : "Also bind catalogue SKUs (optional)"}
          </legend>
          <div className="flex flex-wrap gap-2">
            {unboundSkus.map((sku) => {
              const checked = selectedSkuIds.includes(sku.id);
              return (
                <label
                  key={sku.id}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                    checked ? "border-accent bg-panel-2 text-ink" : "border-line text-quiet hover:border-accent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSku(sku.id)}
                    className="sr-only"
                  />
                  {sku.name}
                  <span className="text-quiet">{sku.formFactor}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </form>
  );
}
