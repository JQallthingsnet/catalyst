"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UnassignSkuButton({
  tenantId,
  skuId,
  skuName,
}: {
  tenantId: string;
  skuId: string;
  skuName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/skus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unassign", tenantId, skuId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not remove SKU.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not remove SKU.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={busy}
        title={`Remove ${skuName} from this contract`}
        onClick={() => void remove()}
        className="text-xs text-danger hover:underline disabled:opacity-40"
      >
        {busy ? "…" : "Remove"}
      </button>
      {error ? <span className="max-w-40 text-right text-[10px] text-danger">{error}</span> : null}
    </span>
  );
}