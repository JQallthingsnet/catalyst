"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatIccid } from "@/lib/portal/ids";
import type { SimState } from "@/lib/portal/catalogue";
import { WizardActions, WizardFrame } from "@/components/portal/wizard";

type Option = { id: string; name: string };
type SimRow = { iccid: string; state: string; planName: string | null; customerName: string | null };

const STATES: SimState[] = ["Ready", "Active", "Suspended", "Deactivated"];

export function AssignWizard({
  customers,
  plans,
  sims,
}: {
  customers: Option[];
  plans: Option[];
  sims: SimRow[];
}) {
  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [iccidQuery, setIccidQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<Set<SimState>>(() => new Set(STATES));
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const customer = customers.find((item) => item.id === customerId);
  const plan = plans.find((item) => item.id === planId);

  const filtered = useMemo(() => {
    const q = iccidQuery.replace(/\s/g, "");
    return sims.filter((sim) => {
      if (!stateFilter.has(sim.state as SimState)) return false;
      if (unassignedOnly && sim.customerName) return false;
      if (q && !sim.iccid.includes(q)) return false;
      return true;
    });
  }, [sims, stateFilter, unassignedOnly, iccidQuery]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((sim) => selected.includes(sim.iccid));

  const nextDisabled =
    step === 0
      ? !customerId
      : step === 1
        ? !planId || selected.length === 0
        : !customerId || !planId || selected.length === 0;

  function toggleState(state: SimState) {
    setStateFilter((current) => {
      const next = new Set(current);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  }

  function toggle(iccid: string) {
    setSelected((current) => (current.includes(iccid) ? current.filter((item) => item !== iccid) : [...current, iccid]));
  }

  function toggleAllFiltered() {
    const ids = filtered.map((sim) => sim.iccid);
    setSelected((current) => {
      if (ids.length === 0) return current;
      if (ids.every((id) => current.includes(id))) {
        return current.filter((id) => !ids.includes(id));
      }
      return [...new Set([...current, ...ids])];
    });
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, planId, iccids: selected }),
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
      steps={["Customer", "SIMs / plan", "Confirm"]}
      step={step}
      summary={
        <>
          <p>{selected.length} SIMs</p>
          <p>Plan {plan?.name ?? "—"}</p>
          <p className="text-ok">Assign in Catalyst</p>
        </>
      }
    >
      {step === 0 ? (
        <div className="space-y-2">
          {customers.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-quiet">
                Create an end customer first, then assign warehouse SIMs to them. Shipping stays outside Catalyst.
              </p>
              <Link
                href="/dashboard/customers"
                className="inline-flex rounded-card bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink"
              >
                Go to Customers
              </Link>
              <p className="text-xs text-quiet">Only a reseller admin can add customer names.</p>
            </div>
          ) : (
            <>
              {customers.map((item) => (
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
              ))}
              {plans.length === 0 ? (
                <p className="pt-2 text-xs text-quiet">
                  Next you will need a retail plan — create one on{" "}
                  <Link href="/dashboard/plans" className="text-accent">
                    Plans
                  </Link>{" "}
                  first.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {step === 1 ? (
        plans.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-quiet">
              Create a retail plan from your contracted plans before assigning SIMs.
            </p>
            <Link
              href="/dashboard/plans"
              className="inline-flex rounded-card bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink"
            >
              Go to Plans
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm">
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
            </label>

            <div className="space-y-3 rounded-card border border-line bg-canvas/40 p-3">
              <label className="block text-sm">
                ICCID contains
                <input
                  value={iccidQuery}
                  onChange={(event) => setIccidQuery(event.target.value)}
                  placeholder="Filter by digits…"
                  className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 font-mono text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {STATES.map((state) => {
                  const on = stateFilter.has(state);
                  return (
                    <button
                      key={state}
                      type="button"
                      onClick={() => toggleState(state)}
                      className={`rounded-full px-3 py-1 text-xs ${
                        on ? "bg-accent text-accent-ink" : "border border-line text-quiet"
                      }`}
                    >
                      {state}
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-sm text-quiet">
                <input
                  type="checkbox"
                  checked={unassignedOnly}
                  onChange={(event) => setUnassignedOnly(event.target.checked)}
                />
                Warehouse only (no end customer yet)
              </label>
              <p className="text-xs text-quiet">
                {filtered.length === sims.length
                  ? `${sims.length} SIMs — filter to narrow, then tick rows to Continue.`
                  : `Showing ${filtered.length} of ${sims.length}.`}
              </p>
            </div>

            <div className="max-h-72 overflow-auto">
              {sims.length === 0 ? (
                <p className="text-sm text-quiet">No SIMs in this organisation. Sell stock first.</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-quiet">No SIMs match these filters. Widen State or clear ICCID.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-quiet">
                    <tr>
                      <th className="pb-2">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleAllFiltered}
                          aria-label="Select all visible"
                        />
                      </th>
                      <th className="pb-2">ICCID</th>
                      <th className="pb-2">Customer</th>
                      <th className="pb-2">Plan</th>
                      <th className="pb-2">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((sim) => (
                      <tr key={sim.iccid} className="border-t border-line">
                        <td className="py-2">
                          <input
                            type="checkbox"
                            checked={selected.includes(sim.iccid)}
                            onChange={() => toggle(sim.iccid)}
                          />
                        </td>
                        <td className="py-2 font-mono">{formatIccid(sim.iccid)}</td>
                        <td className="py-2 text-quiet">{sim.customerName ?? "—"}</td>
                        <td className="py-2 text-quiet">{sim.planName ?? "—"}</td>
                        <td className="py-2">{sim.state}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      ) : null}

      {step === 2 ? (
        <p className="text-sm leading-6 text-quiet">
          Confirm saves the end customer and retail plan in Catalyst only (Jasper End customer is not
          updated). If a SIM is on a different contracted rate plan, Assign moves it to this retail
          plan’s parent using the same Plan changes rules.
        </p>
      ) : null}

      {error ? <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {customers.length > 0 && !(step === 1 && plans.length === 0) ? (
        <WizardActions
          onBack={step > 0 ? () => setStep(step - 1) : undefined}
          onNext={() => {
            if (step < 2) setStep(step + 1);
            else void submit();
          }}
          nextLabel={step < 2 ? "Continue" : "Assign"}
          busy={busy}
          disabled={nextDisabled}
        />
      ) : null}
    </WizardFrame>
  );
}
