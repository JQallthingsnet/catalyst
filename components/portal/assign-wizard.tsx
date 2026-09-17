"use client";

import { useMemo, useState } from "react";
import { formatIccid } from "@/lib/portal/ids";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";

type Option = { id: string; name: string };
type SimRow = { iccid: string; state: string; planName: string | null };

export function AssignWizard({
  customers,
  plans,
  pools,
  sims,
}: {
  customers: Option[];
  plans: Option[];
  pools: Option[];
  sims: SimRow[];
}) {
  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [poolId, setPoolId] = useState(pools[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const customer = customers.find((item) => item.id === customerId);
  const plan = plans.find((item) => item.id === planId);
  const pool = pools.find((item) => item.id === poolId);

  const ready = useMemo(() => sims.filter((sim) => sim.state === "Ready" || sim.state === "Active"), [sims]);

  function toggle(iccid: string) {
    setSelected((current) => (current.includes(iccid) ? current.filter((item) => item !== iccid) : [...current, iccid]));
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, planId, poolId: poolId || undefined, iccids: selected }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Assign failed.");
        return;
      }
      window.location.assign("/dashboard/sims");
    } catch {
      setError("Assign failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardFrame
      title={`Assign SIMs${customer ? ` · ${customer.name}` : ""}`}
      steps={["Customer", "SIMs / plan / pool", "Confirm"]}
      step={step}
      summary={
        <>
          <p>{selected.length} SIMs</p>
          <p>Plan {plan?.name ?? "—"}</p>
          <p>Pool {pool?.name ?? "None"}</p>
          <p className="text-ok">Assign & sync CC</p>
        </>
      }
    >
      {step === 0 ? (
        <div className="space-y-2">
          {customers.length === 0 ? (
            <p className="text-sm text-quiet">A reseller admin needs to add a customer name first.</p>
          ) : (
            customers.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCustomerId(item.id)}
                className={`block w-full rounded-card border px-4 py-3 text-left ${
                  customerId === item.id ? "border-accent bg-panel-2" : "border-line"
                }`}
              >
                {item.name}
              </button>
            ))
          )}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Retail plan
              <select
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
              >
                {plans.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {plans.length === 0 ? (
                <p className="mt-2 text-xs text-quiet">Copy a contracted ATN plan to retail first.</p>
              ) : null}
            </label>
            <label className="text-sm">
              Pool (optional)
              <select
                value={poolId}
                onChange={(event) => setPoolId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2"
              >
                <option value="">None</option>
                {pools.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-quiet">
                <tr>
                  <th className="pb-2" />
                  <th className="pb-2">ICCID</th>
                  <th className="pb-2">Plan</th>
                  <th className="pb-2">State</th>
                </tr>
              </thead>
              <tbody>
                {ready.map((sim) => (
                  <tr key={sim.iccid} className="border-t border-line">
                    <td className="py-2">
                      <input type="checkbox" checked={selected.includes(sim.iccid)} onChange={() => toggle(sim.iccid)} />
                    </td>
                    <td className="py-2 font-mono">{formatIccid(sim.iccid)}</td>
                    <td className="py-2 text-quiet">{sim.planName ?? "—"}</td>
                    <td className="py-2">{sim.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <p className="text-sm leading-6 text-quiet">
          Confirm writes the retail mapping, optional pool, and tenant/customer tags to Control Center. Failed CC calls
          surface an error and retry; Catalyst will not silently diverge.
        </p>
      ) : null}

      {error ? <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <WizardActions
        onBack={step > 0 ? () => setStep(step - 1) : undefined}
        onNext={() => {
          if (step < 2) setStep(step + 1);
          else void submit();
        }}
        nextLabel={step < 2 ? "Continue" : "Assign & sync CC"}
        busy={busy}
        disabled={!customerId || !planId || (step === 1 && selected.length === 0)}
      />
    </WizardFrame>
  );
}
