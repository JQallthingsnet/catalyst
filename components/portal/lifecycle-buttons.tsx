"use client";

import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import {
  jasperLifecycleTargets,
  jasperStatusFromSimState,
  normalizeJasperStatus,
  type JasperSettableStatus,
} from "@/lib/portal/catalogue";
import { useState } from "react";

function currentJasperStatus(ccStatus: string | null | undefined, state: string): string | null {
  return normalizeJasperStatus(ccStatus) ?? jasperStatusFromSimState(state);
}

export function LifecycleButtons({
  iccid,
  state,
  ccStatus = null,
  disabled = false,
}: {
  iccid: string;
  state: string;
  /** Live Jasper / CC snapshot status — drives available choices. */
  ccStatus?: string | null;
  /** When bulk selection is active, grey out per-row actions. */
  disabled?: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<JasperSettableStatus | null>(null);
  const current = currentJasperStatus(ccStatus, state);
  const targets = jasperLifecycleTargets(current);

  async function run(status: JasperSettableStatus) {
    if (disabled || !targets.includes(status)) {
      setError(`${status} is not available from ${current ?? state}.`);
      return;
    }
    setBusy(status);
    setError("");
    try {
      const res = await fetch("/api/portal/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iccid, status }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Update failed.");
        return;
      }
      setPending(null);
      window.location.reload();
    } catch {
      setError("Update failed.");
    } finally {
      setBusy(null);
    }
  }

  function onStatusClick(status: JasperSettableStatus) {
    if (disabled || !targets.includes(status)) return;
    setError("");
    setPending(status);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {targets.length === 0 ? (
        <span className="text-[11px] text-quiet" title={current ? undefined : "Sync CC to load Jasper status"}>
          {current ? "No changes" : "Sync CC"}
        </span>
      ) : (
        targets.map((status) => (
          <button
            key={status}
            type="button"
            disabled={disabled || Boolean(busy)}
            title={
              disabled
                ? "Clear bulk selection to use per-SIM actions"
                : `Change Jasper status to ${status}`
            }
            onClick={() => onStatusClick(status)}
            className="rounded-lg border border-line px-2 py-1 text-[11px] text-quiet hover:border-accent hover:text-ink disabled:opacity-40"
          >
            {busy === status ? "…" : status}
          </button>
        ))
      )}
      {error && !pending ? <span className="basis-full text-[11px] text-danger">{error}</span> : null}
      {pending ? (
        <ConfirmDialog
          open
          title={`Set status to ${pending}?`}
          body={
            <p>
              Pushes <span className="font-medium text-ink">{pending}</span> to Jasper / Control Center
              {current ? (
                <>
                  {" "}
                  (from <span className="font-medium text-ink">{current}</span>)
                </>
              ) : null}
              , then refreshes Catalyst from the live status.{" "}
              <span className="font-medium text-ink">ICCID {iccid}</span>
            </p>
          }
          confirmLabel={`Set ${pending}`}
          tone={pending === "DEACTIVATED" || pending === "RETIRED" ? "danger" : "accent"}
          busy={Boolean(busy)}
          error={error}
          onClose={() => {
            if (!busy) setPending(null);
          }}
          onConfirm={() => void run(pending)}
        />
      ) : null}
    </div>
  );
}
