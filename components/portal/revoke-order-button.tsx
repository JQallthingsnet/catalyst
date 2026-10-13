"use client";

import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RevokeOrderButton({
  orderId,
  skuName,
  quantity,
  status,
  mode = "revoke",
}: {
  orderId: string;
  skuName: string;
  quantity: number;
  status: string;
  /** revoke = Submitted (reseller); cancel = post-Submitted (super admin) */
  mode?: "revoke" | "cancel";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isCancel = mode === "cancel";

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: isCancel ? "cancel" : "revoke", orderId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? (isCancel ? "Could not cancel order." : "Could not revoke order."));
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(isCancel ? "Could not cancel order." : "Could not revoke order.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        className="inline-flex min-h-8 items-center rounded-lg border border-danger/40 px-3 text-xs font-medium text-danger hover:border-danger disabled:opacity-40"
      >
        {isCancel ? "Cancel" : "Revoke"}
      </button>
      <ConfirmDialog
        open={open}
        title={isCancel ? "Cancel this order?" : "Revoke this order?"}
        body={
          <p>
            Delete {status} order for <span className="text-ink">{skuName}</span> ×{" "}
            {quantity.toLocaleString("en-AU")}. This cannot be undone.
          </p>
        }
        confirmLabel={isCancel ? "Cancel & delete" : "Revoke & delete"}
        tone="danger"
        busy={busy}
        error={error}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={() => void confirm()}
      />
    </>
  );
}
