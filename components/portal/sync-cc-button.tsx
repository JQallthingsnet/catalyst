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
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void sync()}
        className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm hover:border-accent disabled:opacity-40"
      >
        {busy ? "Syncing…" : "Sync now"}
      </button>
      {error ? <p className="max-w-56 text-right text-xs text-danger">{error}</p> : null}
      {ok ? <p className="max-w-56 text-right text-xs text-ok">{ok}</p> : null}
    </div>
  );
}
