"use client";

import { useState } from "react";

type AlertKind = "pool" | "usage";

type AlertSetting = {
  kind: AlertKind;
  thresholdPct: number | null;
  recipients: string[];
};

/** Placeholder suggestion only — not applied until Save. */
const THRESHOLD_PLACEHOLDER = "80";

export function AlertSettingsForm({
  kind,
  title,
  blurb,
  initial,
}: {
  kind: AlertKind;
  title: string;
  blurb: string;
  initial: AlertSetting;
}) {
  const [thresholdPct, setThresholdPct] = useState(
    initial.thresholdPct != null ? String(initial.thresholdPct) : "",
  );
  const [recipients, setRecipients] = useState(initial.recipients.join("\n"));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/portal/alert-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          thresholdPct: thresholdPct.trim() === "" ? null : Number.parseInt(thresholdPct, 10),
          recipients,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        setting?: AlertSetting & { thresholdPct: number };
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      if (data.setting) {
        setThresholdPct(String(data.setting.thresholdPct));
        setRecipients(data.setting.recipients.join("\n"));
      }
      setMessage(
        data.setting?.recipients.length
          ? `Saved — ${data.setting.recipients.length} recipient${data.setting.recipients.length === 1 ? "" : "s"} at ≥${data.setting.thresholdPct}%.`
          : "Saved — no recipients (this digest is disabled until you add emails).",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-card border border-line bg-panel p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-quiet">{blurb}</p>

      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="block text-sm">
          Trigger threshold (%)
          <input
            type="number"
            min={1}
            max={200}
            value={thresholdPct}
            onChange={(event) => setThresholdPct(event.target.value)}
            placeholder={THRESHOLD_PLACEHOLDER}
            className="mt-2 w-full max-w-xs rounded-xl border border-line bg-canvas px-3 py-2"
          />
          <span className="mt-1 block text-xs text-quiet">
            Email when usage reaches this % of mapped allowance. {THRESHOLD_PLACEHOLDER}% is only a
            suggestion — enter and save the value you want.
          </span>
        </label>

        <label className="block text-sm">
          Recipient emails
          <textarea
            value={recipients}
            onChange={(event) => setRecipients(event.target.value)}
            rows={5}
            placeholder={"one@example.com\ntwo@example.com"}
            className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 font-mono text-sm"
          />
          <span className="mt-1 block text-xs text-quiet">
            One email per line (commas also fine). Leave empty to turn this digest off.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-medium text-accent-ink disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          {message ? <p className="text-sm text-ok">{message}</p> : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </form>
    </article>
  );
}
