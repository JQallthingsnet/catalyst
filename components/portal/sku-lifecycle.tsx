"use client";

import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SkuLifecycle({
  skuId,
  name,
  active,
  orderCount,
}: {
  skuId: string;
  name: string;
  active: boolean;
  orderCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"deactivate" | "reactivate" | "delete" | null>(null);

  async function run() {
    if (!mode) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "delete") {
        const res = await fetch("/api/portal/skus", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: skuId, confirmName: name }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Delete failed.");
          return;
        }
        window.location.assign("/dashboard/catalogue");
        return;
      }
      const res = await fetch("/api/portal/skus", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: skuId, active: mode === "reactivate" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Update failed.");
        return;
      }
      setMode(null);
      router.refresh();
    } catch {
      setError("Update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError("");
            setMode(active ? "deactivate" : "reactivate");
          }}
          className={`text-sm disabled:opacity-40 ${active ? "text-danger" : "text-accent"}`}
        >
          {active ? "Deactivate" : "Reactivate"}
        </button>
        {!active ? (
          <button
            type="button"
            disabled={busy || orderCount > 0}
            title={orderCount > 0 ? "SKU is on an order — keep deactivated" : undefined}
            onClick={() => {
              setError("");
              setMode("delete");
            }}
            className="text-sm text-danger disabled:opacity-40"
          >
            Delete
          </button>
        ) : null}
      </div>
      {error && !mode ? <p className="max-w-xs text-right text-xs text-danger">{error}</p> : null}

      <ConfirmDialog
        open={mode === "deactivate"}
        title={`Deactivate ${name}?`}
        body={
          <p>
            Sell stock and Order SIMs will no longer offer this SKU until you reactivate. Existing warehouse SIMs and
            orders stay in place.
          </p>
        }
        confirmLabel="Deactivate"
        tone="danger"
        busy={busy}
        error={error}
        onClose={() => {
          if (!busy) setMode(null);
        }}
        onConfirm={() => void run()}
      />
      <ConfirmDialog
        open={mode === "reactivate"}
        title={`Reactivate ${name}?`}
        body={<p>This SKU appears again in Sell stock and Order SIMs.</p>}
        confirmLabel="Reactivate"
        tone="accent"
        busy={busy}
        error={error}
        onClose={() => {
          if (!busy) setMode(null);
        }}
        onConfirm={() => void run()}
      />
      <ConfirmDialog
        open={mode === "delete"}
        title={`Delete ${name}?`}
        body={
          <p>
            Permanently removes this catalogue SKU. Only allowed when unused on orders. This cannot be undone.
          </p>
        }
        confirmLabel="Delete permanently"
        tone="danger"
        busy={busy}
        error={error}
        requireName={name}
        onClose={() => {
          if (!busy) setMode(null);
        }}
        onConfirm={() => void run()}
      />
    </div>
  );
}
