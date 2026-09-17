"use client";

import { useState } from "react";

export function SyncCcButton() {
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/portal/cc-sync", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        result?: { pages: number; upserted: number; details?: number; lastPage: boolean; totalCount: number };
      };
      if (!res.ok) {
        setError(data.error ?? "Sync failed.");
        return;
      }
      const result = data.result;
      setOk(
        result
          ? `List ${result.upserted} · details ${result.details ?? 0}.${
              result.lastPage ? " Search cycle complete." : " More list pages remain."
            } Sync again to fill IMSI / usage / session.`
          : "Synced.",
      );
      window.location.reload();
    } catch {
      setError("Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void sync()}
        className="rounded-card border border-line px-4 py-2.5 text-sm hover:border-accent disabled:opacity-40"
      >
        {busy ? "Syncing Control Center…" : "Sync from Control Center"}
      </button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {ok ? <p className="text-sm text-ok">{ok}</p> : null}
    </div>
  );
}
