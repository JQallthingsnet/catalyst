export const PLAN_TYPES = ["Telematics", "Fleet", "Metering", "Handheld"] as const;

/**
 * Jasper / Control Center SIM statuses (not grouped).
 * @see https://developer.cisco.com/docs/control-center/getting-started/
 */
export const JASPER_SIM_STATUSES = [
  "INVENTORY",
  "TEST_READY",
  "ACTIVATION_READY",
  "ACTIVATED",
  "DEACTIVATED",
  "RETIRED",
  "PURGED",
  "REPLACED",
] as const;

export type JasperSimStatus = (typeof JASPER_SIM_STATUSES)[number];

/** Statuses an enterprise account can set via Edit Device Details (not operator-only). */
export const JASPER_SETTABLE_STATUSES = [
  "INVENTORY",
  "TEST_READY",
  "ACTIVATION_READY",
  "ACTIVATED",
  "DEACTIVATED",
  "RETIRED",
] as const;

export type JasperSettableStatus = (typeof JASPER_SETTABLE_STATUSES)[number];

/** @deprecated Prefer Jasper status targets — kept for legacy Activate/Deactivate aliases. */
export const LIFECYCLE_ACTIONS = ["Activate", "Deactivate"] as const;

/**
 * Catalyst SIM state. Still written on sync for older views; UI/lifecycle use Jasper status.
 * `Suspended` is legacy; Jasper sync remaps SUSPENDED → Deactivated.
 */
export type SimState = "Ready" | "Active" | "Suspended" | "Deactivated";
export type OrderStatus = "Draft" | "Submitted" | "Accepted" | "Shipped" | "Received";

/** @deprecated Use JasperSettableStatus — Activate/Deactivate only mapped ACTIVATED/DEACTIVATED. */
export type JasperLifecycleStatus = JasperSettableStatus;

export function normalizeJasperStatus(raw: string | null | undefined): JasperSimStatus | null {
  const value = (raw ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!value) return null;
  if (value === "ACTIVE") return "ACTIVATED";
  if (value === "READY") return "TEST_READY";
  if ((JASPER_SIM_STATUSES as readonly string[]).includes(value)) {
    return value as JasperSimStatus;
  }
  return null;
}

export function isJasperSettableStatus(value: string): value is JasperSettableStatus {
  return (JASPER_SETTABLE_STATUSES as readonly string[]).includes(value);
}

/**
 * Jasper statuses available to choose from the live current status.
 * Operator-only end-states (PURGED / REPLACED) have no portal targets.
 * Account rules can still reject a target at push time — Jasper remains source of truth.
 */
export function jasperLifecycleTargets(
  currentRaw: string | null | undefined,
): JasperSettableStatus[] {
  const current = normalizeJasperStatus(currentRaw);
  if (!current || current === "PURGED" || current === "REPLACED") return [];
  return JASPER_SETTABLE_STATUSES.filter((status) => status !== current);
}

/** Derive a Jasper status guess when CC snapshot has not synced yet. */
export function jasperStatusFromSimState(state: SimState | string | null | undefined): JasperSimStatus | null {
  if (state === "Active") return "ACTIVATED";
  if (state === "Deactivated" || state === "Suspended") return "DEACTIVATED";
  if (state === "Ready") return "TEST_READY";
  return normalizeJasperStatus(state);
}

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

/** Resolve portal Activate/Deactivate or a Jasper status string to a settable Jasper status. */
export function resolveLifecycleJasperStatus(actionOrStatus: string): JasperSettableStatus | null {
  if (actionOrStatus === "Activate") return "ACTIVATED";
  if (actionOrStatus === "Deactivate") return "DEACTIVATED";
  const normalized = normalizeJasperStatus(actionOrStatus);
  if (normalized && isJasperSettableStatus(normalized)) return normalized;
  return null;
}

/** @deprecated Use resolveLifecycleJasperStatus. */
export function lifecycleJasperStatus(action: string): JasperSettableStatus | null {
  return resolveLifecycleJasperStatus(action);
}

/** @deprecated Use jasperLifecycleTargets with live CC status. */
export function lifecycleTarget(action: string, current: SimState): SimState | null {
  if (action === "Activate" && (current === "Ready" || current === "Suspended" || current === "Deactivated")) {
    return "Active";
  }
  if (action === "Deactivate" && current !== "Deactivated") return "Deactivated";
  const status = resolveLifecycleJasperStatus(action);
  if (!status) return null;
  const from = jasperStatusFromSimState(current);
  if (!from) return null;
  return jasperLifecycleTargets(from).includes(status)
    ? status === "ACTIVATED"
      ? "Active"
      : status === "DEACTIVATED" || status === "RETIRED"
        ? "Deactivated"
        : "Ready"
    : null;
}

/** @deprecated Same rules as lifecycleTarget (request queue kept for Jasper-off fallback). */
export function lifecycleRequestTarget(action: string, current: SimState): SimState | null {
  return lifecycleTarget(action, current);
}
