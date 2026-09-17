export const PLAN_TYPES = ["Telematics", "Fleet", "Metering", "Handheld"] as const;
export const POOL_TYPES = ["Fleet data", "Shared roaming", "Site cap"] as const;

export const LIFECYCLE_ACTIONS = ["Activate", "Suspend", "Resume", "Deactivate"] as const;

export type SimState = "Ready" | "Active" | "Suspended" | "Deactivated";
export type OrderStatus = "Draft" | "Submitted" | "Accepted" | "Shipped" | "Received";

export function lifecycleTarget(action: string, current: SimState): SimState | null {
  if (action === "Activate" && (current === "Ready" || current === "Suspended")) return "Active";
  if (action === "Suspend" && current === "Active") return "Suspended";
  if (action === "Resume" && current === "Suspended") return "Active";
  if (action === "Deactivate" && current !== "Deactivated") return "Deactivated";
  return null;
}
