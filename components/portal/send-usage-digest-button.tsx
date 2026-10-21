"use client";

import { useState } from "react";
import { btnSecondary } from "@/lib/portal/button-styles";

/** Super admin: force today's digests using Alerts settings (Pools + reseller Pools/Usage). */
export function SendUsageDigestButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function sendNow() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/portal/sim-allowance-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = (await res.json()) as {
        emailed?: boolean;
        newlyAlerted?: number;
        day?: string;
        skipReason?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not send digest.");
      if (data.emailed) {
        setMessage(
          `Digests sent for ${data.day}: ${data.newlyAlerted ?? 0} breach row(s). Uses Alerts recipients and thresholds.`,
        );
      } else if (data.skipReason === "no_breaches") {
        setMessage("No pools/SIMs at the configured thresholds right now — nothing to email.");
      } else {
        setMessage(data.skipReason ? `Skipped: ${data.skipReason}` : "Digest not sent.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not send digest.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void sendNow()}
        className={btnSecondary}
      >
        {busy ? "Sending…" : "Send digest now"}
      </button>
      {message ? <p className="max-w-xs text-right text-xs text-quiet">{message}</p> : null}
    </div>
  );
}
