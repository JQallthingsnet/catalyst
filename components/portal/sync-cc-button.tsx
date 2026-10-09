"use client";

import { useState } from "react";

type Progress = {
  devicesInCopy: number;
  jasperTotal: number | null;
  nextPage: number;
  lastFetchedPage: number | null;
  lastPageComplete: boolean;
  autoPoll: boolean;
  lastError: string | null;
  percent: number | null;
};

type BatchResult = {
  pages: number;
  upserted: number;
  details?: number;
  lastPage: boolean;
  totalCount: number;
  nextPage: number;
  devicesInCopy: number;
  complete: boolean;
  autoPoll: boolean;
  lastError: string | null;
  percent: number | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function SyncCcButton({
  initialDevices,
  initialJasperTotal,
  initialComplete,
}: {
  initialDevices?: number;
  initialJasperTotal?: number | null;
  initialComplete?: boolean;
}) {
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  async function runCatchUp() {
    setBusy(true);
    setError("");
    setOk("");
    setProgress({
      devicesInCopy: initialDevices ?? 0,
      jasperTotal: initialJasperTotal ?? null,
      nextPage: 1,
      lastFetchedPage: null,
      lastPageComplete: Boolean(initialComplete),
      autoPoll: false,
      lastError: null,
      percent: null,
    });

    try {
      const startRes = await fetch("/api/portal/cc-sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const startData = (await startRes.json()) as { error?: string; progress?: Progress };
      if (!startRes.ok) {
        setError(startData.error ?? "Could not start Sync.");
        return;
      }
      if (startData.progress) setProgress(startData.progress);
      const started = startData.progress;
      if (
        started?.lastPageComplete &&
        started.jasperTotal != null &&
        started.devicesInCopy >= Math.floor(started.jasperTotal * 0.95)
      ) {
        setOk(
          `Already caught up — ${started.devicesInCopy.toLocaleString("en-AU")} devices in copy` +
            ` / ${started.jasperTotal.toLocaleString("en-AU")} Search. Use Auto poll for incremental updates.`,
        );
        return;
      }

      let complete = false;
      let rateLimitWaits = 0;
      while (!complete) {
        const res = await fetch("/api/portal/cc-sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "batch" }),
        });
        const data = (await res.json()) as { error?: string; result?: BatchResult };
        if (!res.ok) {
          if (/already in flight|already running/i.test(data.error ?? "")) {
            await sleep(2_000);
            continue;
          }
          setError(data.error ?? "Sync failed.");
          return;
        }
        const result = data.result;
        if (!result) {
          setError("Sync returned no result.");
          return;
        }

        setProgress({
          devicesInCopy: result.devicesInCopy,
          jasperTotal: result.totalCount > 0 ? result.totalCount : null,
          nextPage: result.nextPage,
          lastFetchedPage: result.lastPage ? result.nextPage : result.nextPage > 1 ? result.nextPage - 1 : null,
          lastPageComplete: result.complete,
          autoPoll: result.autoPoll,
          lastError: result.lastError,
          percent: result.percent,
        });

        if (result.lastError && /rate limit/i.test(result.lastError)) {
          rateLimitWaits += 1;
          if (rateLimitWaits > 8) {
            setError(result.lastError);
            return;
          }
          await sleep(60_000);
          continue;
        }
        rateLimitWaits = 0;

        if (result.complete || result.lastPage) {
          complete = true;
          setOk(
            `Catch-up complete — ${result.devicesInCopy.toLocaleString("en-AU")} devices in copy` +
              (result.totalCount > 0 ? ` (Jasper Search ${result.totalCount.toLocaleString("en-AU")})` : "") +
              `. Auto poll turned ON for incremental updates.`,
          );
          await sleep(800);
          window.location.reload();
          return;
        }

        // Brief pause so the UI can paint and Jasper is not slammed.
        await sleep(400);
      }
    } catch {
      setError("Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  const percent = progress?.percent;
  const barWidth = percent != null ? percent : progress ? Math.min(95, (progress.nextPage / 150) * 100) : 0;

  return (
    <div className="flex min-w-56 flex-col items-end gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void runCatchUp()}
        className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm hover:border-accent disabled:opacity-40"
      >
        {busy ? "Syncing…" : "Sync now"}
      </button>
      {busy || progress ? (
        <div className="w-full max-w-xs space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <p className="text-right text-xs text-quiet">
            {progress
              ? `${progress.devicesInCopy.toLocaleString("en-AU")} in copy` +
                (progress.jasperTotal != null
                  ? ` / ${progress.jasperTotal.toLocaleString("en-AU")} Search`
                  : "") +
                ` · page ${progress.nextPage.toLocaleString("en-AU")}` +
                (percent != null ? ` · ${percent}%` : "")
              : "Starting…"}
          </p>
        </div>
      ) : null}
      {error ? <p className="max-w-xs text-right text-xs text-danger">{error}</p> : null}
      {ok ? <p className="max-w-xs text-right text-xs text-ok">{ok}</p> : null}
    </div>
  );
}
