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

/** Super admin: raw CTD + sessionInfo probes; shows exact Jasper HTTP responses. */
export function CcJasperProbeButton() {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [error, setError] = useState("");

  async function probeOne(kind: "ctd" | "session", iccid?: string): Promise<ProbeResult> {
    const res = await fetch("/api/portal/cc-probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, iccid }),
    });
    const data = (await res.json()) as ProbeResult & { error?: string };
    if (!res.ok) {
      return {
        kind,
        iccid: iccid ?? "",
        path: kind === "session" ? `/devices/${iccid ?? "?"}/sessionInfo` : `/devices/${iccid ?? "?"}/ctdUsages`,
        httpStatus: res.status,
        ok: false,
        body: data,
        rawText: data.error ?? `${kind} probe failed.`,
        durationMs: 0,
        error: data.error ?? `${kind} probe failed.`,
      };
    }
    return data;
  }

  async function probe() {
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const ctd = await probeOne("ctd");
      const session = await probeOne("session", ctd.iccid || undefined);
      setResults([ctd, session]);
      if (!ctd.iccid && session.error) {
        setError(session.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Probe request failed.");
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
        {busy ? "Probing…" : "Probe Jasper (CTD + session)"}
      </button>
      {error ? <p className="max-w-md text-right text-xs text-danger">{error}</p> : null}
      {results.length > 0 ? (
        <pre className="max-h-96 max-w-xl overflow-auto rounded-card border border-line bg-panel p-3 text-left text-xs text-ink">
          {JSON.stringify(
            results.map((result) => ({
              kind: result.kind,
              httpStatus: result.httpStatus,
              ok: result.ok,
              durationMs: result.durationMs,
              path: result.path,
              iccid: result.iccid,
              body: result.body,
              ...(result.error ? { error: result.error } : {}),
              ...(typeof result.body !== "object" || result.body === null
                ? { rawText: result.rawText }
                : {}),
            })),
            null,
            2,
          )}
        </pre>
      ) : null}
    </div>
  );
}
