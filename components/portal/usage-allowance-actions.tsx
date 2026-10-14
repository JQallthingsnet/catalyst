"use client";

import { useState } from "react";
import { RatePlanAllowancesDialog } from "@/components/portal/rate-plan-allowances-dialog";
import type { UsageAllowanceBasis } from "@/lib/portal/sim-usage";

/** Super admin only: edit Jasper rate-plan allowances. Reseller modem mapping is platform-owned. */
export function UsageAllowanceActions({
  basis,
  canEdit,
}: {
  basis: UsageAllowanceBasis;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!canEdit || basis !== "rate_plan") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent"
      >
        Rate plan allowances
      </button>
      <RatePlanAllowancesDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
