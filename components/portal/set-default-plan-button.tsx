"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SetDefaultPlanButton({
  tenantId,
  platformPlanId,
  isDefault,
}: {
  tenantId: string;
  platformPlanId: string;
  isDefault: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (isDefault) {
    return <span className="text-xs font-medium text-ok">Default</span>;
  }

  async function setDefault() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/platform-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setDefault", tenantId, platformPlanId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not set default.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not set default.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void setDefault()}
        className="text-xs text-accent disabled:opacity-40"
      >
        Make default
      </button>
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}
