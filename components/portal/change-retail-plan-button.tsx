"use client";

import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { useMemo, useState } from "react";

export type RetailPlanOption = { id: string; label: string };

export function ChangeRetailPlanButton({
  iccid,
  currentPlanId,
  hasCustomer,
  options,
  disabled = false,
}: {
  iccid: string;
  currentPlanId: string | null;
  hasCustomer: boolean;
  options: RetailPlanOption[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const choices = useMemo(
    () => options.filter((item) => item.id !== currentPlanId),
    [options, currentPlanId],
  );

  function openDialog() {
    if (disabled || !hasCustomer) return;
    setError("");
    setPlanId(choices[0]?.id ?? "");
    setOpen(true);
  }

  async function submit() {
    if (!planId) {
      setError("Choose a retail plan.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/retail-plan-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iccid, planId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Change failed.");
        return;
      }
      setOpen(false);
      window.location.reload();
    } catch {
      setError("Change failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!hasCustomer) {
    return <span className="text-[11px] text-quiet">Assign first</span>;
  }

  if (choices.length === 0) {
    return <span className="text-[11px] text-quiet">No other plans</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled}
        title={disabled ? "Clear bulk selection to change one SIM" : undefined}
        className="rounded-lg border border-line px-2 py-1 text-[11px] text-quiet hover:border-accent hover:text-ink disabled:opacity-40"
      >
        Change plan
      </button>
      <ConfirmDialog
        open={open}
        title="Change retail plan?"
        body={
          <div className="space-y-3">
            <p>
              Update the retail plan on{" "}
              <span className="font-medium text-ink">ICCID {iccid}</span> for this end customer.
              If the new plan uses a different contracted Reseller Plan, that is updated too.
            </p>
            <label className="block text-sm text-quiet">
              New retail plan
              <select
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink"
              >
                {choices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
        confirmLabel="Change plan"
        busy={busy}
        error={error}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={() => void submit()}
      />
    </>
  );
}
