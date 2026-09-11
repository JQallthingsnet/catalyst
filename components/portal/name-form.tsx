"use client";

import { useState } from "react";

export function NameForm({ kind, placeholder, button }: { kind: "customer" | "tenant"; placeholder: string; button: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Save failed.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={placeholder}
        className="min-w-56 flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
      />
      <button type="submit" disabled={busy || !name.trim()} className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-canvas disabled:opacity-40">
        {busy ? "Saving…" : button}
      </button>
      {error ? <p className="w-full text-sm text-danger">{error}</p> : null}
    </form>
  );
}
