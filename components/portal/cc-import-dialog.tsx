"use client";

import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { parseIccidsFromCsv } from "@/lib/cc/csv";

type ImportResult = {
  requested: number;
  imported: number;
  notFound: string[];
  failed: string[];
  rateLimited: boolean;
  remaining: number;
};

export function CcImportDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [csvText, setCsvText] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setError("");
    setSummary("");
    setCsvText("");
    setQueue([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setQueue(parseIccidsFromCsv(text));
    setError("");
    setSummary("");
  }

  async function runImport(iccids: string[]) {
    setBusy(true);
    setError("");
    let pending = iccids;
    let imported = 0;
    let notFound = 0;
    let failed = 0;
    try {
      while (pending.length > 0) {
        const res = await fetch("/api/portal/cc-devices/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ iccids: pending }),
        });
        const data = (await res.json()) as { error?: string; result?: ImportResult };
        if (!res.ok || !data.result) {
          setError(data.error ?? "Import failed.");
          break;
        }
        const result = data.result;
        imported += result.imported;
        notFound += result.notFound.length;
        failed += result.failed.length;
        const processed = result.requested;
        pending = pending.slice(processed);
        setQueue(pending);
        setSummary(
          `Imported ${imported.toLocaleString("en-AU")}` +
            (notFound ? ` · not found ${notFound.toLocaleString("en-AU")}` : "") +
            (failed ? ` · failed ${failed.toLocaleString("en-AU")}` : "") +
            (pending.length
              ? ` · ${pending.length.toLocaleString("en-AU")} left`
              : " · done"),
        );
        if (result.rateLimited && pending.length > 0) {
          setError("Control Center rate limited. Wait a minute, then Import again — remaining ICCIDs stay in the dialog.");
          break;
        }
        if (result.requested === 0) break;
      }
      if (pending.length === 0 && imported > 0) {
        window.location.reload();
      }
    } catch {
      setError("Import failed.");
    } finally {
      setBusy(false);
    }
  }

  const parsedCount = queue.length > 0 ? queue.length : parseIccidsFromCsv(csvText).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm hover:border-accent"
      >
        Import ICCIDs
      </button>
      <ConfirmDialog
        open={open}
        title="Import ICCIDs into CC snapshot"
        confirmLabel={busy ? "Importing…" : "Import from Jasper"}
        busy={busy}
        error={error}
        onClose={close}
        onConfirm={() => {
          const iccids = queue.length > 0 ? queue : parseIccidsFromCsv(csvText);
          if (iccids.length === 0) {
            setError("Add ICCIDs or upload a CSV first (see sample).");
            return;
          }
          void runImport(iccids);
        }}
        body={
          <div className="space-y-3 text-sm text-quiet">
            <p>
              For SIMs Jasper Search never returns (idle longer than ~1 year). Paste or upload ICCIDs; we fetch each
              from Control Center and upsert into this snapshot.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href="/api/portal/cc-devices/import/sample"
                className="inline-flex h-9 items-center rounded-full border border-line px-3 text-xs text-ink hover:border-accent"
              >
                Download sample CSV
              </a>
              <label className="inline-flex h-9 cursor-pointer items-center rounded-full border border-line px-3 text-xs text-ink hover:border-accent">
                Upload CSV
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <label className="block text-xs font-medium text-quiet">
              ICCIDs (CSV or one per line)
              <textarea
                value={csvText}
                onChange={(event) => {
                  setCsvText(event.target.value);
                  setQueue(parseIccidsFromCsv(event.target.value));
                }}
                rows={8}
                placeholder={"iccid\n8944200123456789012\n8944200123456789013"}
                className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 font-mono text-xs text-ink"
              />
            </label>
            <p className="text-xs">
              {parsedCount > 0
                ? `${parsedCount.toLocaleString("en-AU")} valid ICCID${parsedCount === 1 ? "" : "s"} ready (25 per batch).`
                : "No valid ICCIDs yet — use the sample CSV as a template."}
            </p>
            {summary ? <p className="text-xs text-ok">{summary}</p> : null}
          </div>
        }
      />
    </>
  );
}
