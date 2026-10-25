export const PLAN_TYPES = ["Telematics", "Fleet", "Metering", "Handheld"] as const;

export const LIFECYCLE_ACTIONS = ["Activate", "Suspend", "Resume", "Deactivate"] as const;

export type SimState = "Ready" | "Active" | "Suspended" | "Deactivated";
export type OrderStatus = "Draft" | "Submitted" | "Accepted" | "Shipped" | "Received";

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

export function lifecycleTarget(action: string, current: SimState): SimState | null {
  if (action === "Activate" && (current === "Ready" || current === "Suspended")) return "Active";
  if (action === "Suspend" && current === "Active") return "Suspended";
  if (action === "Resume" && current === "Suspended") return "Active";
  if (action === "Deactivate" && current !== "Deactivated") return "Deactivated";
  return null;
}
