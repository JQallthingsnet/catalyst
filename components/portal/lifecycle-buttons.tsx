"use client";

import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { LIFECYCLE_ACTIONS, lifecycleTarget, type SimState } from "@/lib/portal/catalogue";
import { useState } from "react";

const ACTION_COPY: Record<string, { title: string; body: string; confirmLabel: string }> = {
  Activate: {
    title: "Activate this SIM?",
    body: "Pushes ACTIVATED to Jasper / Control Center, then refreshes Catalyst from the live status.",
    confirmLabel: "Activate",
  },
  Deactivate: {
    title: "Deactivate this SIM?",
    body: "Pushes DEACTIVATED to Jasper / Control Center (stops data). Catalyst then refreshes from the live status.",
    confirmLabel: "Deactivate",
  },
};

function asSimState(value: string): SimState | null {
  if (value === "Ready" || value === "Active" || value === "Suspended" || value === "Deactivated") {
    return value;
  }
  return null;
}

export function LifecycleButtons({ iccid, state }: { iccid: string; state: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const simState = asSimState(state);

  function actionAllowed(action: string): boolean {
    if (!simState) return true;
    return lifecycleTarget(action, simState) != null;
  }

  async function run(action: string) {
    if (!actionAllowed(action)) {
      setError(`${action} is not valid from ${state}.`);
      return;
    }
    setBusy(action);
    setError("");
    try {
      const res = await fetch("/api/portal/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iccid, action }),
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

  function onActionClick(action: string) {
    if (!actionAllowed(action)) return;
    setError("");
    setPending(action);
  }

  const copy = pending ? ACTION_COPY[pending] : null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {LIFECYCLE_ACTIONS.map((action) => {
        const allowed = actionAllowed(action);
        return (
          <button
            key={action}
            type="button"
            disabled={Boolean(busy) || !allowed}
            title={allowed ? undefined : `${action} is not valid from ${state}`}
            onClick={() => onActionClick(action)}
            className="rounded-lg border border-line px-2 py-1 text-[11px] text-quiet hover:border-accent hover:text-ink disabled:opacity-40"
          >
            {busy === action ? "…" : action}
          </button>
        );
      })}
      {error && !pending ? <span className="basis-full text-[11px] text-danger">{error}</span> : null}
      {copy && pending ? (
        <ConfirmDialog
          open
          title={copy.title}
          body={
            <p>
              {copy.body}{" "}
              <span className="font-medium text-ink">ICCID {iccid}</span>
            </p>
          }
          confirmLabel={copy.confirmLabel}
          tone={pending === "Deactivate" ? "danger" : "accent"}
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
