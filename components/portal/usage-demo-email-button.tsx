"use client";

import { useState } from "react";

export function UsageDemoEmailButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function sendDemo() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/portal/usage/demo-alert", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        count?: number;
        to?: string[];
      };
      if (!res.ok) throw new Error(data.error ?? "Demo email failed.");
      setMessage(
        `Demo sent to ${(data.to ?? []).join(", ") || "inbox"} — top ${data.count ?? 0} SIMs by %.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Demo email failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void sendDemo()}
        className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent disabled:opacity-40"
      >
        {busy ? "Sending…" : "Demo email (top 10 %)"}
      </button>
      {message ? <p className="max-w-xs text-right text-xs text-quiet">{message}</p> : null}
    </div>
  );
}
