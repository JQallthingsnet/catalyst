"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BindPlanToResellerForm({
  tenantId,
  plans,
}: {
  tenantId: string;
  plans: { id: string; ratePlanNew: string; remarks: string }[];
}) {
  const router = useRouter();
  const [platformPlanId, setPlatformPlanId] = useState(plans[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (plans.length === 0) {
    return <p className="text-xs text-quiet">Create an ATN plan first, then bind it here.</p>;
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/platform-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, platformPlanId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not bind plan.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not bind plan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <select
        value={platformPlanId}
        onChange={(event) => setPlatformPlanId(event.target.value)}
        className="rounded-xl border border-line bg-canvas px-2 py-1.5 text-xs"
      >
        {plans.map((plan) => (
          <option key={plan.id} value={plan.id}>
            {plan.ratePlanNew} — {plan.remarks}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={busy || !platformPlanId}
        className="rounded-full border border-line px-3 py-1.5 text-xs text-ink hover:border-accent disabled:opacity-40"
      >
        {busy ? "Binding…" : "Add rate plan"}
      </button>
      {error ? <p className="w-full text-xs text-danger">{error}</p> : null}
    </form>
  );
}
