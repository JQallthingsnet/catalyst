"use client";

import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { useState } from "react";

export function DeleteSkuButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
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
        return;
      }
      window.location.assign("/dashboard/catalogue");
    } catch {
      setError("Could not delete SKU.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm text-danger hover:border-danger disabled:opacity-40"
      >
        Delete
      </button>
      {error && !open ? <p className="max-w-56 text-right text-xs text-danger">{error}</p> : null}
      <ConfirmDialog
        open={open}
        title={`Delete ${name}?`}
        body={<p>This removes the catalogue SKU. Existing SIM assignments are not changed.</p>}
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        error={error}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
