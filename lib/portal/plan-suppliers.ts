/** Commercial source of the radio rate plan (carrier / MVNO), not the OSS brand. */
export const PLAN_SUPPLIERS = ["Optus", "Other"] as const;

export type PlanSupplier = (typeof PLAN_SUPPLIERS)[number];

export const DEFAULT_PLAN_SUPPLIER: PlanSupplier = "Optus";

const LEGACY_SUPPLIER_ALIASES: Record<string, PlanSupplier> = {
  "cisco iot control center": "Optus",
  "control center": "Optus",
  jasper: "Optus",
};

export function normalizePlanSupplier(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return DEFAULT_PLAN_SUPPLIER;
  const aliased = LEGACY_SUPPLIER_ALIASES[trimmed.toLowerCase()];
  if (aliased) return aliased;
  return trimmed;
}

export function isListedPlanSupplier(value: string): value is PlanSupplier {
  return (PLAN_SUPPLIERS as readonly string[]).includes(value);
}
