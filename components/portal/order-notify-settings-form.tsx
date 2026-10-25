"use client";

import { useState } from "react";

export function OrderNotifySettingsForm({
  initialRecipients,
}: {
  initialRecipients: string[];
}) {
  const [recipients, setRecipients] = useState(initialRecipients.join("\n"));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/portal/order-notify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients }),
      });
      const data = (await res.json()) as {
        error?: string;
        setting?: { recipients: string[] };
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      if (data.setting) setRecipients(data.setting.recipients.join("\n"));
      const count = data.setting?.recipients.length ?? 0;
      setMessage(
        count
          ? `Saved — ${count} recipient${count === 1 ? "" : "s"} will be emailed when a reseller Orders SIMs.`
          : "Saved — no recipients (order emails are off until you add addresses).",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-card border border-line bg-panel p-5">
      <h2 className="font-semibold">Order SIMs</h2>
      <p className="mt-1 text-sm text-quiet">
        Email these ATN addresses when a reseller submits Order SIMs. Leave empty to keep notifications off.
      </p>

      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="block text-sm">
          Recipient emails
          <textarea
            value={recipients}
            onChange={(event) => setRecipients(event.target.value)}
            rows={4}
            placeholder={"ops@allthingsnet.io\nbilling@allthingsnet.io"}
            className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 font-mono text-sm"
          />
          <span className="mt-1 block text-xs text-quiet">One email per line (or comma-separated).</span>
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {message ? <p className="text-sm text-ok">{message}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="rounded-card bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </article>
  );
}
