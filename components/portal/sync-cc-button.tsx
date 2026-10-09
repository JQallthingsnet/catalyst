"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

        await sleep(400);
      }
    } catch {
      setError("Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  const percent = progress?.percent;
  const barWidth =
    percent != null ? percent : progress ? Math.min(92, Math.max(4, (progress.nextPage / 160) * 100)) : 4;
  const showPanel = busy || Boolean(progress) || Boolean(error) || Boolean(ok);
  const slot = mounted ? document.getElementById("cc-sync-progress") : null;

  const panel =
    showPanel && slot
      ? createPortal(
          <div className="mt-4 rounded-card border border-line bg-panel p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">
                  {busy ? "Syncing Control Center list…" : ok ? "Sync finished" : error ? "Sync stopped" : "Sync"}
                </p>
                <p className="mt-1 text-sm text-quiet">
                  {progress
                    ? `${progress.devicesInCopy.toLocaleString("en-AU")} devices in copy` +
                      (progress.jasperTotal != null
                        ? ` of ${progress.jasperTotal.toLocaleString("en-AU")} from Search`
                        : " · Search total updating…") +
                      ` · list page ${progress.nextPage.toLocaleString("en-AU")}`
                    : ok || error || "Starting catch-up…"}
                </p>
              </div>
              {busy || percent != null ? (
                <p className="text-2xl font-semibold tabular-nums text-ink">
                  {percent != null ? `${percent}%` : "…"}
                </p>
              ) : null}
            </div>
            {(busy || progress) && !ok ? (
              <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-canvas">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            ) : null}
            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
            {ok ? <p className="mt-3 text-sm text-ok">{ok}</p> : null}
          </div>,
          slot,
        )
      : null;

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void runCatchUp()}
        className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm hover:border-accent disabled:opacity-40"
      >
        {busy ? "Syncing…" : "Sync now"}
      </button>
      {panel}
    </>
  );
}
