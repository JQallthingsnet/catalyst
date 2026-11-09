"use client";

import { useState } from "react";
import { btnSecondary } from "@/lib/portal/button-styles";

export function InvoiceExportButton({
  monthKey,
  organisationId = "",
}: {
  monthKey: string;
  organisationId?: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function exportXlsx() {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (monthKey) params.set("month", monthKey);
      if (organisationId) params.set("org", organisationId);
      const res = await fetch(`/api/portal/invoices/export?${params.toString()}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `catalyst-invoice-${monthKey}.xlsx`;
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
      <button type="button" disabled={busy} onClick={() => void exportXlsx()} className={btnSecondary}>
        {busy ? "Exporting…" : "Export invoice (Excel)"}
      </button>
      {error ? <p className="max-w-56 text-right text-xs text-danger">{error}</p> : null}
    </div>
  );
}
