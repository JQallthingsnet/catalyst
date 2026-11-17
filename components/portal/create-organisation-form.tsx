"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary } from "@/lib/portal/button-styles";

export function CreateOrganisationForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { error?: string; tenant?: { id: string } };
      if (!res.ok) {
        setError(data.error ?? "Could not create organisation.");
        return;
      }
      const id = data.tenant?.id;
      if (id) {
        router.push(`/dashboard/contracts/${id}`);
        router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setError("Could not create organisation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="block text-sm">
        Organisation name
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Unique brand / organisation name"
          className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-xs text-quiet">
          Must be unique. Shown top left in their portal. Next: Reseller Plans → catalogue → invite
          admins.
        </span>
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button type="submit" disabled={busy || name.trim().length < 2} className={btnPrimary}>
        {busy ? "Creating…" : "Create organisation"}
      </button>
    </form>
  );
}
