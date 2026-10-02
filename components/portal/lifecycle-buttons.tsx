"use client";

import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { LIFECYCLE_ACTIONS } from "@/lib/portal/catalogue";
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

export function LifecycleButtons({ iccid }: { iccid: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function run(action: string) {
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
    setError("");
    if (CONFIRM_ACTIONS.has(action)) {
      setPending(action);
      return;
    }
    void run(action);
  }

  const copy = pending ? ACTION_COPY[pending] : null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {LIFECYCLE_ACTIONS.map((action) => (
        <button
          key={action}
          type="button"
          disabled={Boolean(busy)}
          onClick={() => onActionClick(action)}
          className="rounded-lg border border-line px-2 py-1 text-[11px] text-quiet hover:border-accent hover:text-ink disabled:opacity-40"
        >
          {busy === action ? "…" : action}
        </button>
      ))}
      {error && !pending ? <span className="text-[11px] text-danger">{error}</span> : null}
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
          tone="danger"
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
