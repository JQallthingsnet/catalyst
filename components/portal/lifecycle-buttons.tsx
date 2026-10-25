"use client";

import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import {
  LIFECYCLE_ACTIONS,
  lifecycleRequestTarget,
  lifecycleTarget,
  type SimState,
} from "@/lib/portal/catalogue";
import { useState } from "react";

const CONFIRM_ACTIONS = new Set(["Suspend", "Deactivate"]);

const ACTION_COPY: Record<string, { title: string; body: string; confirmLabel: string }> = {
  Suspend: {
    title: "Suspend this SIM?",
    body: "The SIM will stop using data until you resume it.",
    confirmLabel: "Suspend",
  },
  Deactivate: {
    title: "Deactivate this SIM?",
    body: "The SIM will leave active service. Reactivation may require another Activate step.",
    confirmLabel: "Deactivate",
  },
};

const REQUEST_COPY: Record<string, { title: string; body: string; confirmLabel: string }> = {
  Activate: {
    title: "Request Activate?",
    body: "Queues Activate for ATN to process (including reactivate from Deactivated). It will appear on Logs as a lifecycle request.",
    confirmLabel: "Request Activate",
  },
  Suspend: {
    title: "Request Suspend?",
    body: "Queues Suspend for ATN to process. It will appear on Logs as a lifecycle request.",
    confirmLabel: "Request Suspend",
  },
  Resume: {
    title: "Request Resume?",
    body: "Queues Resume for ATN to process. It will appear on Logs as a lifecycle request.",
    confirmLabel: "Request Resume",
  },
  Deactivate: {
    title: "Request Deactivate?",
    body: "Queues Deactivate for ATN to process. It will appear on Logs as a lifecycle request.",
    confirmLabel: "Request Deactivate",
  },
};

function asSimState(value: string): SimState | null {
  if (value === "Ready" || value === "Active" || value === "Suspended" || value === "Deactivated") {
    return value;
  }
  return null;
}

export function LifecycleButtons({
  iccid,
  state,
  mode = "apply",
}: {
  iccid: string;
  state: string;
  /** apply = super admin local; request = reseller → ATN email queue */
  mode?: "apply" | "request";
}) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const isRequest = mode === "request";
  const simState = asSimState(state);

  function actionAllowed(action: string): boolean {
    if (!simState) return true;
    return isRequest
      ? lifecycleRequestTarget(action, simState) != null
      : lifecycleTarget(action, simState) != null;
  }

  async function run(action: string) {
    if (!actionAllowed(action)) {
      setError(`${action} is not valid from ${state}.`);
      return;
    }
    setBusy(action);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/portal/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iccid, action }),
      });
      const data = (await res.json()) as { error?: string; message?: string; mode?: string };
      if (!res.ok) {
        setError(data.error ?? "Update failed.");
        return;
      }
      setPending(null);
      if (data.mode === "requested") {
        setMessage(data.message ?? "Queued for ATN.");
        return;
      }
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
    setMessage("");
    if (isRequest || CONFIRM_ACTIONS.has(action)) {
      setPending(action);
      return;
    }
    void run(action);
  }

  const copy = pending
    ? isRequest
      ? REQUEST_COPY[pending]
      : ACTION_COPY[pending] ?? REQUEST_COPY[pending]
    : null;

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
            {busy === action ? "…" : isRequest ? `Request ${action}` : action}
          </button>
        );
      })}
      {error && !pending ? <span className="basis-full text-[11px] text-danger">{error}</span> : null}
      {message && !pending ? <span className="basis-full text-[11px] text-ok">{message}</span> : null}
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
          tone={pending === "Suspend" || pending === "Deactivate" ? "danger" : "accent"}
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
