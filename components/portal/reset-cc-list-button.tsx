"use client";

import { useState } from "react";

export function ResetCcListButton() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function reset() {
    if (
      !window.confirm(
        "Restart the Control Center list crawl from page 1 over the last ~360 days? Existing rows stay; Sync/auto poll will refill from Jasper Search Devices.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/cc-sync/reset-list", { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Reset failed.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void reset()}
        className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm hover:border-accent disabled:opacity-40"
      >
        {busy ? "Resetting…" : "Restart list crawl"}
      </button>
      {error ? <p className="max-w-56 text-right text-xs text-danger">{error}</p> : null}
    </div>
  );
}
