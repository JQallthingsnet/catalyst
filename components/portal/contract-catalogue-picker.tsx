"use client";

import { CatalogueSkuMultiSelect, type CatalogueSkuOption } from "@/components/portal/catalogue-sku-multi-select";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export function ContractCataloguePicker({
  tenantId,
  options,
  boundIds,
  hasRatePlans,
}: {
  tenantId: string;
  options: CatalogueSkuOption[];
  boundIds: string[];
  hasRatePlans: boolean;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState(boundIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const boundKey = boundIds.slice().sort().join(",");
  const syncGen = useRef(0);

  useEffect(() => {
    setSelectedIds(boundIds);
  }, [boundKey, boundIds]);

  async function apply(nextIds: string[]) {
    const previous = selectedIds;

    if (hasRatePlans && nextIds.length === 0 && previous.length > 0) {
      setError("Keep at least one catalogue SKU while rate plans are on the contract.");
      return;
    }

    // Optimistic: ticks flip immediately.
    setSelectedIds(nextIds);
    setError("");

    const prevSet = new Set(previous);
    const nextSet = new Set(nextIds);
    const toAdd = nextIds.filter((id) => !prevSet.has(id));
    const toRemove = previous.filter((id) => !nextSet.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) return;

    const gen = ++syncGen.current;
    setSaving(true);
    try {
      const results = await Promise.all([
        ...toAdd.map(async (skuId) => {
          const res = await fetch("/api/portal/skus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "assign", tenantId, skuId }),
          });
          const data = (await res.json()) as { error?: string };
          if (!res.ok) throw new Error(data.error ?? "Could not update catalogue.");
        }),
        ...toRemove.map(async (skuId) => {
          const res = await fetch("/api/portal/skus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "unassign", tenantId, skuId }),
          });
          const data = (await res.json()) as { error?: string };
          if (!res.ok) throw new Error(data.error ?? "Could not update catalogue.");
        }),
      ]);
      void results;
      if (gen !== syncGen.current) return;
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      if (gen !== syncGen.current) return;
      setSelectedIds(previous);
      setError(err instanceof Error ? err.message : "Could not update catalogue.");
    } finally {
      if (gen === syncGen.current) setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <CatalogueSkuMultiSelect
        label="Tick products this reseller may order"
        options={options}
        selectedIds={selectedIds}
        onChange={(next) => void apply(next)}
        placeholder="Choose catalogue SKUs…"
        showChips
      />
      <p className="text-[11px] text-quiet">
        {saving || pending ? "Saving…" : selectedIds.length === 0 ? "None bound yet." : "Saved."}
      </p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
