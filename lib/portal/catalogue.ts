export const SIM_SKUS = [
  {
    id: "nano-ltem-au",
    name: "Nano SIM LTE-M AU",
    formFactor: "Nano",
    tech: "LTE-M",
    region: "Australia",
    blurb: "Consumer nano SIM for AU LTE-M telematics.",
  },
  {
    id: "mff2-industrial",
    name: "MFF2 Industrial",
    formFactor: "MFF2",
    tech: "LTE-M",
    region: "Industrial",
    blurb: "Soldered industrial module SIM.",
  },
  {
    id: "esim-global",
    name: "eSIM Global",
    formFactor: "eSIM",
    tech: "LTE / 5G",
    region: "Global",
    blurb: "Downloadable profile. Destination email required.",
  },
] as const;

export const WHOLESALE_PLANS = [
  { id: "T50", label: "Telematics 50 MB" },
  { id: "T500", label: "Telematics 500 MB" },
  { id: "F1GB", label: "Fleet 1 GB" },
] as const;

export const COMM_PLANS = [
  { id: "data", label: "Data only" },
  { id: "data-sms", label: "Data + SMS" },
] as const;

export const PLAN_TYPES = ["Telematics", "Fleet", "Metering", "Handheld"] as const;
export const POOL_TYPES = ["Fleet data", "Shared roaming", "Site cap"] as const;

export const LIFECYCLE_ACTIONS = ["Activate", "Suspend", "Resume", "Deactivate"] as const;

export type SimState = "Ready" | "Active" | "Suspended" | "Deactivated";
export type OrderStatus = "Draft" | "Submitted" | "Accepted" | "Shipped" | "Received";

export function skuById(id: string) {
  return SIM_SKUS.find((sku) => sku.id === id);
}

export function wholesalePlanById(id: string) {
  return WHOLESALE_PLANS.find((plan) => plan.id === id);
}

export function commPlanById(id: string) {
  return COMM_PLANS.find((plan) => plan.id === id);
}

export function lifecycleTarget(action: string, current: SimState): SimState | null {
  if (action === "Activate" && (current === "Ready" || current === "Suspended")) return "Active";
  if (action === "Suspend" && current === "Active") return "Suspended";
  if (action === "Resume" && current === "Suspended") return "Active";
  if (action === "Deactivate" && current !== "Deactivated") return "Deactivated";
  return null;
}
