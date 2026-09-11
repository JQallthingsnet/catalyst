"use client";

import { LIFECYCLE_ACTIONS } from "@/lib/portal/catalogue";
import { useState } from "react";

export function LifecycleButtons({ iccid }: { iccid: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

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
      window.location.reload();
    } catch {
      setError("Update failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {LIFECYCLE_ACTIONS.map((action) => (
        <button
          key={action}
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void run(action)}
          className="rounded-lg border border-line px-2 py-1 text-[11px] text-quiet hover:border-accent hover:text-ink disabled:opacity-40"
        >
          {busy === action ? "…" : action}
        </button>
      ))}
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </div>
  );
}
