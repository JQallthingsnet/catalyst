"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnSecondary } from "@/lib/portal/button-styles";
import { formatAuDateTime } from "@/lib/portal/time";

export type ContractDocumentPanelMeta = {
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
} | null;

export function ContractDocumentPanel({
  tenantId,
  meta,
  canUpload = false,
}: {
  tenantId: string;
  meta: ContractDocumentPanelMeta;
  canUpload?: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showViewer, setShowViewer] = useState(Boolean(meta));
  const router = useRouter();
  const pdfUrl = `/api/portal/contract-document?tenantId=${encodeURIComponent(tenantId)}`;
  const downloadUrl = `${pdfUrl}&download=1`;

  async function onUpload(file: File | null) {
    if (!file || !canUpload) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("tenantId", tenantId);
      body.set("file", file);
      const res = await fetch("/api/portal/contract-document", { method: "POST", body });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      setShowViewer(true);
      router.refresh();
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!canUpload || !meta) return;
    if (!window.confirm("Remove the uploaded signed contract PDF?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/contract-document", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Remove failed.");
        return;
      }
      setShowViewer(false);
      router.refresh();
    } catch {
      setError("Remove failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-line bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Signed contract (PDF)</h2>
          <p className="mt-1 text-xs text-quiet">
            {canUpload
              ? "Upload the signed agreement for this organisation. Visible to ATN and the reseller admin (view + download)."
              : "Signed agreement with ATN — view or download."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {meta ? (
            <>
              <a href={pdfUrl} target="_blank" rel="noreferrer" className={btnSecondary}>
                Open
              </a>
              <a href={downloadUrl} className={btnSecondary}>
                Download
              </a>
              <button type="button" className={btnSecondary} onClick={() => setShowViewer((v) => !v)}>
                {showViewer ? "Hide preview" : "Show preview"}
              </button>
            </>
          ) : null}
          {canUpload && meta ? (
            <button type="button" disabled={busy} onClick={() => void onRemove()} className={btnSecondary}>
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {meta ? (
        <p className="mt-3 text-xs text-quiet">
          {meta.fileName} · {(meta.sizeBytes / 1024).toLocaleString("en-AU", { maximumFractionDigits: 1 })}{" "}
          KB · uploaded {formatAuDateTime(meta.uploadedAt)} by {meta.uploadedBy}
        </p>
      ) : (
        <p className="mt-3 text-sm text-quiet">No signed PDF uploaded yet.</p>
      )}

      {canUpload ? (
        <label className="mt-4 block text-sm">
          {meta ? "Replace PDF" : "Upload PDF"}
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            className="mt-2 block w-full text-sm text-quiet file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent-ink"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              void onUpload(file);
            }}
          />
          <span className="mt-1 block text-xs text-quiet">PDF only, max 10 MB.</span>
        </label>
      ) : null}

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {busy ? <p className="mt-2 text-sm text-quiet">Working…</p> : null}

      {meta && showViewer ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-canvas">
          <iframe
            title={`Signed contract for ${tenantId}`}
            src={pdfUrl}
            className="h-[70vh] w-full bg-canvas"
          />
        </div>
      ) : null}
    </section>
  );
}
