/** Where ATN buys / maps the radio rate plan. */
export const PLAN_SUPPLIERS = [
  "Cisco IoT Control Center",
  "Singapore Telecom",
  "China Mobile",
  "Other",
] as const;

export type PlanSupplier = (typeof PLAN_SUPPLIERS)[number];
