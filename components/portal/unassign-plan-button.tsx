"use client";

import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UnassignPlanButton({
  platformPlanId,
  tenantId,
  tenantName,
  simCount,
}: {
  platformPlanId: string;
  tenantId: string;
  tenantName: string;
  simCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/platform-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unassign", tenantId, platformPlanId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not unbind.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not unbind.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy || simCount > 0}
        title={simCount > 0 ? "Clear SIMs for this reseller on this plan first" : "Remove contract"}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        className="text-sm text-danger disabled:opacity-40"
      >
        Unbind
      </button>
      <ConfirmDialog
        open={open}
        title={`Unbind ${tenantName}?`}
        body={<p>This reseller will no longer see or buy this ATN plan. Existing SIMs are not changed.</p>}
        confirmLabel="Unbind"
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
