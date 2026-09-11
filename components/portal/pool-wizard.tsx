"use client";

import { useState } from "react";
import { POOL_TYPES } from "@/lib/portal/catalogue";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";

export function PoolWizard({ readyIccids }: { readyIccids: string[] }) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<(typeof POOL_TYPES)[number]>("Fleet data");
  const [name, setName] = useState("Fleet-A");
  const [capGb, setCapGb] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function toggle(iccid: string) {
    setSelected((current) => (current.includes(iccid) ? current.filter((item) => item !== iccid) : [...current, iccid]));
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, capMb: capGb * 1024, iccids: selected }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not create pool.");
        return;
      }
      window.location.assign("/dashboard/pools");
    } catch {
      setError("Could not create pool.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardFrame
      title="Create pool"
      steps={["Type", "Members", "Review"]}
      step={step}
      summary={
        <>
          <p>{name}</p>
          <p>{capGb} GB shared cap</p>
          <p>{selected.length} members</p>
          <p>Alerts at 80% and 100%.</p>
        </>
      }
    >
      {step === 0 ? (
        <div className="space-y-4">
          <div className="grid gap-2">
            {POOL_TYPES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setType(item)}
                className={`rounded-card border px-4 py-3 text-left ${type === item ? "border-accent bg-panel-2" : "border-line"}`}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="block text-sm">
            Pool name
            <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2" />
          </label>
          <label className="block text-sm">
            Cap (GB)
            <input
              type="number"
              min={1}
              value={capGb}
              onChange={(event) => setCapGb(Number(event.target.value))}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="max-h-80 space-y-2 overflow-auto">
          {readyIccids.length === 0 ? (
            <p className="text-sm text-quiet">No SIMs in tenant yet. Order SIMs first, or add members later.</p>
          ) : (
            readyIccids.slice(0, 80).map((iccid) => (
              <label key={iccid} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                <input type="checkbox" checked={selected.includes(iccid)} onChange={() => toggle(iccid)} />
                <span className="font-mono">{iccid}</span>
              </label>
            ))
          )}
        </div>
      ) : null}

      {step === 2 ? (
        <p className="text-sm leading-6 text-quiet">
          Shared MB cap is enforced commercially in v1 (suspend at 100% if Control Center pooling is not native). The
          ICD will record the live Control Center primitive.
        </p>
      ) : null}

      {error ? <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <WizardActions
        onBack={step > 0 ? () => setStep(step - 1) : undefined}
        onNext={() => {
          if (step < 2) setStep(step + 1);
          else void submit();
        }}
        nextLabel={step < 2 ? "Continue" : "Create pool"}
        busy={busy}
        disabled={!name.trim()}
      />
    </WizardFrame>
  );
}
