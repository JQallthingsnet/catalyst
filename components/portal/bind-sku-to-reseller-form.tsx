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
  const [skuId, setSkuId] = useState(skus[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (skus.length === 0) {
    return <p className="text-xs text-quiet">Create a catalogue SKU first, then bind it here.</p>;
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
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
      router.refresh();
    } catch {
      setError("Could not bind SKU.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <select
        value={skuId}
        onChange={(event) => setSkuId(event.target.value)}
        className="rounded-xl border border-line bg-canvas px-2 py-1.5 text-xs"
      >
        {skus.map((sku) => (
          <option key={sku.id} value={sku.id}>
            {sku.name} — {sku.formFactor}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={busy || !skuId}
        className="rounded-full border border-line px-3 py-1.5 text-xs text-ink hover:border-accent disabled:opacity-40"
      >
        {busy ? "Binding…" : "Add catalogue SKU"}
      </button>
      {error ? <p className="w-full text-xs text-danger">{error}</p> : null}
    </form>
  );
}
