"use client";

import Link from "next/link";
import { PlatformPlanLifecycle } from "@/components/portal/platform-plan-lifecycle";
import { PLAN_SUPPLIERS } from "@/lib/portal/plan-suppliers";
import { useDeferredValue, useMemo, useState } from "react";

export type PlatformPlanRow = {
  id: string;
  name: string;
  supplier: string;
  ccRatePlan: string;
  commPlan: string;
  active: boolean;
  assignedResellers: number;
  simCount: number;
};

export function PlatformPlansTable({ plans }: { plans: PlatformPlanRow[] }) {
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "deactivated">("all");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const suppliers = useMemo(() => {
    const fromData = [...new Set(plans.map((plan) => plan.supplier).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
    return fromData.length > 0 ? fromData : [...PLAN_SUPPLIERS];
  }, [plans]);

  const filtered = useMemo(() => {
    return plans.filter((plan) => {
      if (supplier && plan.supplier !== supplier) return false;
      if (status === "active" && !plan.active) return false;
      if (status === "deactivated" && plan.active) return false;
      if (!deferredQuery) return true;
      const haystack = `${plan.name} ${plan.supplier} ${plan.ccRatePlan} ${plan.commPlan}`.toLowerCase();
      return haystack.includes(deferredQuery);
    });
  }, [plans, deferredQuery, supplier, status]);

  const filtersActive = Boolean(query.trim() || supplier || status !== "all");

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-card border border-line bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block text-xs font-medium text-quiet sm:col-span-2 xl:col-span-2">
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, rate plan, comm plan…"
              className="mt-1 h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm text-ink"
            />
          </label>
          <label className="block text-xs font-medium text-quiet">
            Supplier
            <select
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
              className="mt-1 h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm text-ink"
            >
              <option value="">All suppliers</option>
              {suppliers.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-quiet">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "all" | "active" | "deactivated")}
              className="mt-1 h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm text-ink"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </label>
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
                setSupplier("");
                setStatus("all");
              }}
              className="text-accent hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-200 text-left text-sm">
          <thead className="border-b border-line text-quiet">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">Rate plan</th>
              <th className="px-4 py-3 font-medium">Comm plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Resellers</th>
              <th className="px-4 py-3 font-medium">SIMs</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((plan) => (
              <tr key={plan.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/plans/${plan.id}`} className="font-medium hover:text-accent">
                    {plan.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-quiet">{plan.supplier}</td>
                <td className="px-4 py-3 font-mono text-xs">{plan.ccRatePlan}</td>
                <td className="px-4 py-3 text-quiet">{plan.commPlan}</td>
                <td className="px-4 py-3">
                  <span className={plan.active ? "text-ok" : "text-danger"}>
                    {plan.active ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td className="px-4 py-3">{plan.assignedResellers}</td>
                <td className="px-4 py-3">{plan.simCount}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <Link href={`/dashboard/plans/${plan.id}`} className="text-sm text-accent">
                      Manage
                    </Link>
                    <PlatformPlanLifecycle
                      planId={plan.id}
                      name={plan.name}
                      active={plan.active}
                      simCount={plan.simCount}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-sm text-quiet">
            {plans.length === 0 ? "No ATN plans yet." : "No plans match these filters."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
