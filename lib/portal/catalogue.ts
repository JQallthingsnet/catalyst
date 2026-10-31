export const PLAN_TYPES = ["Telematics", "Fleet", "Metering", "Handheld"] as const;

/** Portal lifecycle buttons — map 1:1 to Jasper ACTIVATED / DEACTIVATED. */
export const LIFECYCLE_ACTIONS = ["Activate", "Deactivate"] as const;

/**
 * Catalyst SIM state. `Suspended` is legacy (pre Activate/Deactivate-only);
 * Jasper sync remaps SUSPENDED → Deactivated.
 */
export type SimState = "Ready" | "Active" | "Suspended" | "Deactivated";
export type OrderStatus = "Draft" | "Submitted" | "Accepted" | "Shipped" | "Received";

export type JasperLifecycleStatus = "ACTIVATED" | "DEACTIVATED";

/** Next fulfillment step for Order SIMs (physical or eSIM). Sell stock is already Received. */
export function nextOrderSimsStatus(current: OrderStatus): OrderStatus | null {
  if (current === "Draft" || current === "Submitted") return "Accepted";
  if (current === "Accepted") return "Shipped";
  if (current === "Shipped") return "Received";
  return null;
}

export function orderAdvanceLabel(next: OrderStatus): string {
  if (next === "Accepted") return "Accept";
  if (next === "Shipped") return "Mark shipped";
  if (next === "Received") return "Mark received";
  return next;
}

/** Jasper Edit Device Details `status` for a portal lifecycle action. */
export function lifecycleJasperStatus(action: string): JasperLifecycleStatus | null {
  if (action === "Activate") return "ACTIVATED";
  if (action === "Deactivate") return "DEACTIVATED";
  return null;
}

export function lifecycleTarget(action: string, current: SimState): SimState | null {
  // Reactivate from Deactivated (and legacy Suspended) is valid in Jasper.
  if (action === "Activate" && (current === "Ready" || current === "Suspended" || current === "Deactivated")) {
    return "Active";
  }
  if (action === "Deactivate" && current !== "Deactivated") return "Deactivated";
  return null;
}

/** @deprecated Same rules as lifecycleTarget (request queue kept for Jasper-off fallback). */
export function lifecycleRequestTarget(action: string, current: SimState): SimState | null {
  return lifecycleTarget(action, current);
}
