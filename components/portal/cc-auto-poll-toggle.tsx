"use client";

import { useState } from "react";

export function CcAutoPollToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    const next = !on;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/cc-sync/auto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not update auto poll.");
        return;
      }
      setOn(next);
      window.location.reload();
    } catch {
      setError("Could not update auto poll.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggle()}
        className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-medium disabled:opacity-40 ${
          on ? "bg-accent text-canvas" : "border border-line text-ink hover:border-accent"
        }`}
      >
        {busy ? "Updating…" : on ? "Auto poll ON" : "Auto poll OFF"}
      </button>
      {error ? <p className="max-w-48 text-right text-xs text-danger">{error}</p> : null}
    </div>
  );
}
