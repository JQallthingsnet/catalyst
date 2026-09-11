"use client";

import { useState } from "react";

export function AddSuperAdminForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/super-admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not add admin.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Could not add admin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-4 flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="partner@allthingsnet.io"
        className="min-w-56 flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
      />
      <button type="submit" disabled={busy} className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-canvas disabled:opacity-40">
        {busy ? "Adding…" : "Add super admin"}
      </button>
      {error ? <p className="w-full text-sm text-danger">{error}</p> : null}
    </form>
  );
}
