"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Number box to set billing value rank for a contracted Reseller Plan. */
export function SetValueRankField({
  tenantId,
  platformPlanId,
  valueRank,
  disabled = false,
}: {
  tenantId: string;
  platformPlanId: string;
  valueRank: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(valueRank));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(String(valueRank));
  }, [valueRank]);

  async function save(nextRaw: string) {
    const parsed = Number.parseInt(nextRaw.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9999) {
      setError("Enter a whole number 0–9999.");
      setValue(String(valueRank));
      return;
    }
    if (parsed === valueRank) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/platform-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setValueRank",
          tenantId,
          platformPlanId,
          valueRank: parsed,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save rank.");
        setValue(String(valueRank));
        return;
      }
      router.refresh();
    } catch {
      setError("Could not save rank.");
      setValue(String(valueRank));
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex flex-col items-start gap-0.5 text-[11px] text-quiet">
      <span title="Higher value is billed when two Reseller Plans occur on the same Sydney day">
        Value rank
      </span>
      <input
        type="number"
        min={0}
        max={9999}
        step={1}
        disabled={disabled || busy}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void save(value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
        }}
        className="h-8 w-16 rounded-lg border border-line bg-canvas px-2 text-sm tabular-nums text-ink disabled:opacity-40"
      />
      {error ? <span className="text-danger">{error}</span> : null}
    </label>
  );
}
