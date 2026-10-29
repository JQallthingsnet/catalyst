"use client";

import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { orderAdvanceLabel, type OrderStatus } from "@/lib/portal/catalogue";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdvanceOrderButton({
  orderId,
  skuName,
  quantity,
  nextStatus,
}: {
  orderId: string;
  skuName: string;
  quantity: number;
  nextStatus: OrderStatus;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = orderAdvanceLabel(nextStatus);

  const bodyCopy =
    nextStatus === "Accepted"
      ? "Confirm ATN will fulfil this Order SIMs (plastic courier or eSIM provision). Reseller can no longer revoke."
      : nextStatus === "Shipped"
        ? "Mark as shipped: physical SIMs handed to courier, or eSIMs provisioned / sent to the destination email."
        : "Mark received: SIMs are with the reseller (in Jasper under their CC Customer). Sync so they appear in Catalyst for that organisation.";

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance", orderId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not advance order.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not advance order.");
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
        className="inline-flex min-h-8 items-center rounded-lg border border-accent/50 px-3 text-xs font-medium text-accent hover:border-accent disabled:opacity-40"
      >
        {label}
      </button>
      <ConfirmDialog
        open={open}
        title={`${label}?`}
        body={
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-ink">{skuName}</span> × {quantity.toLocaleString("en-AU")} →{" "}
              <span className="text-ink">{nextStatus}</span>
            </p>
            <p className="text-quiet">{bodyCopy}</p>
          </div>
        }
        confirmLabel={label}
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
