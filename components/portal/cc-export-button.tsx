"use client";

import { useState } from "react";

export function CcExportButton({ queryString = "" }: { queryString?: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function exportCsv() {
    setBusy(true);
    setError("");
    try {
      const path = queryString
        ? `/api/portal/cc-devices/export?${queryString}`
        : "/api/portal/cc-devices/export";
      const res = await fetch(path);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `cc-snapshot-${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void exportCsv()}
        className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm hover:border-accent disabled:opacity-40"
      >
        {busy ? "Exporting…" : "Export CSV"}
      </button>
      {error ? <p className="max-w-56 text-right text-xs text-danger">{error}</p> : null}
    </div>
  );
}
