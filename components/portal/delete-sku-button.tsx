"use client";

import { useState } from "react";

export function DeleteSkuButton({ id }: { id: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/skus", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not delete SKU.");
        setBusy(false);
        return;
      }
      window.location.assign("/dashboard/catalogue");
    } catch {
      setError("Could not delete SKU.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void remove()}
        className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm text-danger hover:border-danger disabled:opacity-40"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      {error ? <p className="max-w-56 text-right text-xs text-danger">{error}</p> : null}
    </div>
  );
}
