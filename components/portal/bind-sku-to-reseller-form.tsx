"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BindSkuToResellerForm({
  tenantId,
  skus,
}: {
  tenantId: string;
  skus: { id: string; name: string; formFactor: string }[];
}) {
  const router = useRouter();
  const [selectedSkuIds, setSelectedSkuIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (skus.length === 0) {
    return <p className="text-xs text-quiet">All active catalogue SKUs are already bound.</p>;
  }

  function toggleSku(id: string) {
    setSelectedSkuIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function submit() {
    if (selectedSkuIds.length === 0) {
      setError("Select at least one catalogue SKU.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      for (const skuId of selectedSkuIds) {
        const res = await fetch("/api/portal/skus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "assign", tenantId, skuId }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not bind SKU.");
          return;
        }
      }
      setSelectedSkuIds([]);
      router.refresh();
    } catch {
      setError("Could not bind SKU.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-wrap gap-2">
        {skus.map((sku) => {
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
      <button
        type="submit"
        disabled={busy || selectedSkuIds.length === 0}
        className="rounded-full border border-line px-3 py-1.5 text-xs text-ink hover:border-accent disabled:opacity-40"
      >
        {busy
          ? "Binding…"
          : selectedSkuIds.length > 1
            ? `Add ${selectedSkuIds.length} catalogue SKUs`
            : "Add catalogue SKU"}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </form>
  );
}
