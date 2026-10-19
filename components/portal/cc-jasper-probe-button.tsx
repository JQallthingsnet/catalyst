"use client";

import { useState } from "react";

type ProbeResult = {
  kind: string;
  iccid: string;
  path: string;
  httpStatus: number;
  ok: boolean;
  body: unknown;
  rawText: string;
  durationMs: number;
  error?: string;
};

/** Super admin: one raw CTD enrich call; shows exact Jasper HTTP response. */
export function CcJasperProbeButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [error, setError] = useState("");

  async function probe() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/portal/cc-probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "ctd" }),
      });
      const data = (await res.json()) as ProbeResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Probe failed.");
        return;
      }
      setResult(data);
    } catch {
      setError("Probe request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void probe()}
        className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent disabled:opacity-40"
      >
        {busy ? "Probing…" : "Probe Jasper (1 CTD)"}
      </button>
      {error ? <p className="max-w-md text-right text-xs text-danger">{error}</p> : null}
      {result ? (
        <pre className="max-h-64 max-w-xl overflow-auto rounded-card border border-line bg-panel p-3 text-left text-xs text-ink">
          {JSON.stringify(
            {
              httpStatus: result.httpStatus,
              ok: result.ok,
              durationMs: result.durationMs,
              path: result.path,
              iccid: result.iccid,
              body: result.body,
            },
            null,
            2,
          )}
        </pre>
      ) : null}
    </div>
  );
}
