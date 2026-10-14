"use client";

import { useState } from "react";
import { ModemAllowancesDialog } from "@/components/portal/modem-allowances-dialog";
import { RatePlanAllowancesDialog } from "@/components/portal/rate-plan-allowances-dialog";
import type { UsageAllowanceBasis } from "@/lib/portal/sim-usage";

export function UsageAllowanceActions({
  basis,
  canEdit,
}: {
  basis: UsageAllowanceBasis;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!canEdit) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent"
      >
        {basis === "rate_plan" ? "Rate plan allowances" : "Modem allowances"}
      </button>
      {basis === "rate_plan" ? (
        <RatePlanAllowancesDialog open={open} onClose={() => setOpen(false)} />
      ) : (
        <ModemAllowancesDialog open={open} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
