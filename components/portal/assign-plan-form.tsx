"use client";

import { useState } from "react";

export function AssignPlanForm({
  platformPlanId,
  resellers,
}: {
  platformPlanId: string;
  resellers: { id: string; name: string }[];
}) {
  const [tenantId, setTenantId] = useState(resellers[0]?.id ?? "");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/portal/platform-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, platformPlanId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not assign plan.");
        return;
      }
      setOk("Plan assigned to this reseller.");
      window.location.reload();
    } catch {
      setError("Could not assign plan.");
    } finally {
      setBusy(false);
    }
  }

  if (resellers.length === 0) return <p className="text-sm text-quiet">No organisations yet.</p>;

  return (
    <form
      className="mt-3 flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <select
        value={tenantId}
        onChange={(event) => setTenantId(event.target.value)}
        className="rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
      >
        {resellers.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={busy} className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-canvas disabled:opacity-40">
        {busy ? "Saving…" : "Assign contract"}
      </button>
      {error ? <p className="w-full text-sm text-danger">{error}</p> : null}
      {ok ? <p className="w-full text-sm text-ok">{ok}</p> : null}
    </form>
  );
}
