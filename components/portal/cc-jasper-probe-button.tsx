"use client";

import { useEffect, useId, useRef, useState } from "react";

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

type CtdBody = {
  status?: string;
  ratePlan?: string;
  ctdDataUsage?: number;
  ctdSessionCount?: number;
  msisdn?: string;
  imei?: string;
};

type SessionBody = {
  dateSessionStarted?: string | null;
  dateSessionEnded?: string | null;
  ipAddress?: string | null;
  apn?: string | null;
};

function asRecord(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

function formatBytes(bytes: number | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

function StatusBadge({ ok, status }: { ok: boolean; status: number }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums ${
        ok ? "border-line text-ok" : "border-line text-danger"
      }`}
    >
      {status || "—"} {ok ? "OK" : "fail"}
    </span>
  );
}

function ProbeCard({ result }: { result: ProbeResult }) {
  const [showRaw, setShowRaw] = useState(false);
  const record = asRecord(result.body);
  const title = result.kind === "session" ? "sessionInfo" : "ctdUsages";
  const ctd = result.kind === "ctd" ? (result.body as CtdBody) : null;
  const session = result.kind === "session" ? (result.body as SessionBody) : null;
  const errorCode = record?.errorCode != null ? String(record.errorCode) : null;
  const errorMessage =
    (typeof record?.errorMessage === "string" && record.errorMessage) ||
    (typeof record?.message === "string" && record.message) ||
    result.error ||
    null;

  return (
    <div className="rounded-card border border-line bg-canvas p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{title}</p>
        <div className="flex items-center gap-2">
          <StatusBadge ok={result.ok} status={result.httpStatus} />
          <span className="text-xs tabular-nums text-quiet">{result.durationMs} ms</span>
        </div>
      </div>
      <p className="mt-1 break-all font-mono text-[11px] text-quiet">{result.path}</p>

      {result.ok && ctd ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div>
            <dt className="text-quiet">Status</dt>
            <dd className="mt-0.5 font-medium text-ink">{ctd.status ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-quiet">Rate plan</dt>
            <dd className="mt-0.5 font-medium text-ink">{ctd.ratePlan ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-quiet">CTD data</dt>
            <dd className="mt-0.5 font-medium text-ink">{formatBytes(ctd.ctdDataUsage)}</dd>
          </div>
          <div>
            <dt className="text-quiet">Sessions</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-ink">
              {ctd.ctdSessionCount?.toLocaleString("en-AU") ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-quiet">MSISDN</dt>
            <dd className="mt-0.5 font-mono text-ink">{ctd.msisdn ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-quiet">IMEI</dt>
            <dd className="mt-0.5 font-mono text-ink">{ctd.imei ?? "—"}</dd>
          </div>
        </dl>
      ) : null}

      {result.ok && session ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div className="col-span-2">
            <dt className="text-quiet">In session</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {session.dateSessionStarted && !session.dateSessionEnded
                ? "Yes"
                : session.dateSessionStarted || session.dateSessionEnded
                  ? "No (ended)"
                  : "No"}
            </dd>
          </div>
          <div>
            <dt className="text-quiet">Started</dt>
            <dd className="mt-0.5 font-mono text-[11px] text-ink">{session.dateSessionStarted || "—"}</dd>
          </div>
          <div>
            <dt className="text-quiet">Ended</dt>
            <dd className="mt-0.5 font-mono text-[11px] text-ink">{session.dateSessionEnded || "—"}</dd>
          </div>
          <div>
            <dt className="text-quiet">IP</dt>
            <dd className="mt-0.5 font-mono text-ink">{session.ipAddress || "—"}</dd>
          </div>
          <div>
            <dt className="text-quiet">APN</dt>
            <dd className="mt-0.5 font-mono text-ink">{session.apn || "—"}</dd>
          </div>
        </dl>
      ) : null}

      {!result.ok ? (
        <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">
          {errorCode ? <p className="font-medium">{errorCode}</p> : null}
          <p className={errorCode ? "mt-0.5" : ""}>{errorMessage ?? "Request failed."}</p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setShowRaw((v) => !v)}
        className="mt-3 text-xs text-accent hover:underline"
      >
        {showRaw ? "Hide raw JSON" : "Show raw JSON"}
      </button>
      {showRaw ? (
        <pre className="mt-2 max-h-40 overflow-auto rounded-xl border border-line bg-panel p-2 text-left text-[11px] text-ink">
          {JSON.stringify(result.body ?? result.rawText, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

/** Super admin: CTD + sessionInfo probe in a modal dialog. */
export function CcJasperProbeButton() {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [iccid, setIccid] = useState("");
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [error, setError] = useState("");

  function close() {
    if (busy) return;
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, busy]);

  async function probeOne(kind: "ctd" | "session", probeIccid?: string): Promise<ProbeResult> {
    const res = await fetch("/api/portal/cc-probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, iccid: probeIccid }),
    });
    const data = (await res.json()) as ProbeResult & { error?: string };
    if (!res.ok) {
      return {
        kind,
        iccid: probeIccid ?? "",
        path:
          kind === "session"
            ? `/devices/${probeIccid ?? "?"}/sessionInfo`
            : `/devices/${probeIccid ?? "?"}/ctdUsages`,
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
    const cleaned = iccid.replace(/\s/g, "");
    if (cleaned && !/^\d{15,22}$/.test(cleaned)) {
      setError("ICCID must be 15–22 digits (or leave blank for oldest enriched SIM in D1).");
      setBusy(false);
      return;
    }
    try {
      const ctd = await probeOne("ctd", cleaned || undefined);
      const session = await probeOne("session", ctd.iccid || cleaned || undefined);
      setResults([ctd, session]);
      if (ctd.iccid && !cleaned) setIccid(ctd.iccid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Probe request failed.");
    } finally {
      setBusy(false);
    }
  }

  const probedIccid = results[0]?.iccid || iccid.replace(/\s/g, "") || null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError("");
        }}
        className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent"
      >
        Probe Jasper
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-canvas/70 backdrop-blur-sm"
            disabled={busy}
            onClick={close}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-[min(90vh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-card border border-line bg-panel shadow-xl"
          >
            <div className="shrink-0 border-b border-line px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id={titleId} className="text-lg font-semibold text-ink">
                    Jasper probe
                  </h2>
                  <p className="mt-1 text-sm text-quiet">
                    Raw Control Center GETs — CTD for usage, sessionInfo for live session.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={close}
                  className="text-sm text-quiet hover:text-ink disabled:opacity-40"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ICCID (optional — blank = oldest in D1)"
                  value={iccid}
                  onChange={(e) => setIccid(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !busy) void probe();
                  }}
                  disabled={busy}
                  className="min-w-0 flex-1 rounded-card border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink placeholder:font-sans placeholder:text-quiet disabled:opacity-40"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void probe()}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? "Probing…" : "Run probe"}
                </button>
              </div>
              {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {probedIccid && results.length > 0 ? (
                <p className="mb-3 text-xs text-quiet">
                  ICCID <span className="font-mono text-ink">{probedIccid}</span>
                </p>
              ) : (
                <p className="text-sm text-quiet">Enter an ICCID (or leave blank) and run the probe.</p>
              )}
              {results.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {results.map((result) => (
                    <ProbeCard key={result.kind} result={result} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
