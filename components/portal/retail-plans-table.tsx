"use client";

import { useDeferredValue, useMemo, useState } from "react";

export type RetailPlanRow = {
  id: string;
  name: string;
  type: string;
  inclusiveMb: number;
  pricePerSim: number | null;
  platformPlanName: string | null;
  wholesalePlan: string;
};

export function RetailPlansTable({
  plans,
  showPlatformSource,
}: {
  plans: RetailPlanRow[];
  showPlatformSource: boolean;
}) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const sources = useMemo(() => {
    return [...new Set(plans.map((plan) => plan.platformPlanName).filter(Boolean) as string[])].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [plans]);

  const filtered = useMemo(() => {
    return plans.filter((plan) => {
      if (source && plan.platformPlanName !== source) return false;
      if (!deferredQuery) return true;
      const haystack =
        `${plan.name} ${plan.type} ${plan.wholesalePlan} ${plan.platformPlanName ?? ""}`.toLowerCase();
      return haystack.includes(deferredQuery);
    });
  }, [plans, deferredQuery, source]);

  const filtersActive = Boolean(query.trim() || source);

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-card border border-line bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="block text-xs font-medium text-quiet sm:col-span-2 xl:col-span-2">
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, type, rate plan…"
              className="mt-1 h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm text-ink"
            />
          </label>
          {showPlatformSource && sources.length > 0 ? (
            <label className="block text-xs font-medium text-quiet">
              Copied from
              <select
                value={source}
                onChange={(event) => setSource(event.target.value)}
                className="mt-1 h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm text-ink"
              >
                <option value="">All ATN plans</option>
                {sources.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-quiet">
          <p>
            {filtered.length === plans.length
              ? `${plans.length} plan${plans.length === 1 ? "" : "s"}`
              : `${filtered.length} of ${plans.length} plans`}
          </p>
          {filtersActive ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSource("");
              }}
              className="text-accent hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-160 text-left text-sm">
          <thead className="border-b border-line text-quiet">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Data / SIM</th>
              <th className="px-4 py-3 font-medium">Price / SIM</th>
              {showPlatformSource ? <th className="px-4 py-3 font-medium">Copied from</th> : null}
              <th className="px-4 py-3 font-medium">Rate plan</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((plan) => (
              <tr key={plan.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{plan.name}</td>
                <td className="px-4 py-3 text-quiet">{plan.type}</td>
                <td className="px-4 py-3">{plan.inclusiveMb.toLocaleString("en-AU")} MB</td>
                <td className="px-4 py-3">
                  {plan.pricePerSim != null ? `$${plan.pricePerSim.toLocaleString("en-AU")}` : "—"}
                </td>
                {showPlatformSource ? (
                  <td className="px-4 py-3 text-quiet">{plan.platformPlanName ?? "—"}</td>
                ) : null}
                <td className="px-4 py-3 font-mono text-xs">{plan.wholesalePlan || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-sm text-quiet">
            {plans.length === 0 ? "No retail plans yet." : "No plans match these filters."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
