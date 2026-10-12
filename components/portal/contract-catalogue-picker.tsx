"use client";

import { CatalogueSkuMultiSelect, type CatalogueSkuOption } from "@/components/portal/catalogue-sku-multi-select";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function apply(nextIds: string[]) {
    const current = new Set(boundIds);
    const next = new Set(nextIds);
    const toAdd = nextIds.filter((id) => !current.has(id));
    const toRemove = boundIds.filter((id) => !next.has(id));

    if (toAdd.length === 0 && toRemove.length === 0) return;

    if (hasRatePlans && toRemove.length > 0 && nextIds.length === 0) {
      setError("Keep at least one catalogue SKU while rate plans are on the contract.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      for (const skuId of toAdd) {
        const res = await fetch("/api/portal/skus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "assign", tenantId, skuId }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not update catalogue.");
          return;
        }
      }
      for (const skuId of toRemove) {
        const res = await fetch("/api/portal/skus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unassign", tenantId, skuId }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not update catalogue.");
          return;
        }
      }
      router.refresh();
    } catch {
      setError("Could not update catalogue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <CatalogueSkuMultiSelect
        label="Tick the products this reseller may order"
        options={options}
        selectedIds={boundIds}
        onChange={(next) => void apply(next)}
        disabled={busy}
        placeholder="No catalogue SKUs bound"
      />
      {busy ? <p className="text-xs text-quiet">Updating…</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
