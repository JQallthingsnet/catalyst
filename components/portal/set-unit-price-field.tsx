"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Number box to set AUD unit price for a contracted Reseller Plan (invoice charge). */
export function SetUnitPriceField({
  tenantId,
  platformPlanId,
  unitPriceAud,
  disabled = false,
}: {
  tenantId: string;
  platformPlanId: string;
  unitPriceAud: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(formatPrice(unitPriceAud));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(formatPrice(unitPriceAud));
  }, [unitPriceAud]);

  async function save(nextRaw: string) {
    const parsed = Number.parseFloat(nextRaw.trim());
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 999_999.99) {
      setError("Enter a price from 0 to 999999.99.");
      setValue(formatPrice(unitPriceAud));
      return;
    }
    const rounded = Math.round(parsed * 100) / 100;
    if (rounded === unitPriceAud) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/platform-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setUnitPrice",
          tenantId,
          platformPlanId,
          unitPriceAud: rounded,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save unit price.");
        setValue(formatPrice(unitPriceAud));
        return;
      }
      router.refresh();
    } catch {
      setError("Could not save unit price.");
      setValue(formatPrice(unitPriceAud));
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex flex-col items-start gap-0.5 text-[11px] text-quiet">
      <span title="AUD charged to this reseller organisation per SIM on this Reseller Plan">
        Unit Price (AUD)
      </span>
      <input
        type="number"
        min={0}
        max={999999.99}
        step={0.01}
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
        className="h-8 w-24 rounded-lg border border-line bg-canvas px-2 text-sm tabular-nums text-ink disabled:opacity-40"
      />
      {error ? <span className="text-danger">{error}</span> : null}
    </label>
  );
}

function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100);
}
