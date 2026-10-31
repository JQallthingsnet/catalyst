"use client";

import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { useMemo, useState } from "react";

export type RatePlanOption = { id: string; label: string };

export function ChangeRatePlanButton({
  iccid,
  currentPlatformPlanId,
  options,
  disabled = false,
}: {
  iccid: string;
  currentPlatformPlanId: string | null;
  options: RatePlanOption[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [platformPlanId, setPlatformPlanId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const choices = useMemo(
    () => options.filter((item) => item.id !== currentPlatformPlanId),
    [options, currentPlatformPlanId],
  );

  function openDialog() {
    if (disabled) return;
    setError("");
    setPlatformPlanId(choices[0]?.id ?? "");
    setOpen(true);
  }

  async function submit() {
    if (!platformPlanId) {
      setError("Choose a Reseller Plan.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/rate-plan-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iccid, platformPlanId }),
      });
      const data = (await res.json()) as { error?: string; tcodeMismatch?: boolean };
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
        title="Change Reseller Plan?"
        body={
          <div className="space-y-3">
            <p>
              Update the Reseller Plan on{" "}
              <span className="font-medium text-ink">ICCID {iccid}</span> in Catalyst. Billing
              follows this plan. Jasper is unchanged unless ATN updates it separately.
            </p>
            <label className="block text-sm text-quiet">
              New Reseller Plan
              <select
                value={platformPlanId}
                onChange={(event) => setPlatformPlanId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink"
              >
                {choices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-quiet">
              You can change Reseller Plan any time within contracted plans. Each plan used on a Sydney day
              is kept in the daily usage log (exportable as CSV). A mismatched retail plan on this SIM will
              be cleared.
            </p>
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
