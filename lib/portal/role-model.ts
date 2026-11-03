export type PortalRole = "super_admin" | "reseller_admin" | "reseller_operator";

export const VIEW_AS_COOKIE = "catalyst_view_as";
export const ACTING_TENANT_COOKIE = "catalyst_acting_tenant";

export type Privilege =
  | "admin"
  | "platform.estate"
  | "wholesale.allocate"
  | "platform.plan"
  | "platform.catalogue"
  | "contract.view"
  | "order.create"
  | "plan.create"
  | "plan.edit"
  | "pool.view"
  | "pool.create"
  | "customer.create"
  | "assign"
  | "lifecycle"
  | "rate_plan.change"
  | "audit.view"
  | "alerts.manage"
  | "settings"
  | "invite.operator"
  | "invite.reseller_admin"
  | "invite.super_admin";

const ROLE_PRIVILEGES: Record<PortalRole, Privilege[]> = {
  super_admin: [
    "admin",
    "platform.estate",
    "wholesale.allocate",
    "platform.plan",
    "platform.catalogue",
    "contract.view",
    "order.create",
    "plan.create",
    "plan.edit",
    "pool.view",
    "pool.create",
    "customer.create",
    "assign",
    "lifecycle",
    "rate_plan.change",
    "audit.view",
    "alerts.manage",
    "settings",
    "invite.operator",
    "invite.reseller_admin",
    "invite.super_admin",
  ],
  reseller_admin: [
    "order.create",
    "plan.create",
    "plan.edit",
    "pool.view",
    "pool.create",
    "customer.create",
    "assign",
    "lifecycle",
    "rate_plan.change",
    "audit.view",
    "alerts.manage",
    "settings",
    "invite.operator",
    "contract.view",
  ],
  reseller_operator: ["assign", "lifecycle"],
};

export type PortalNavItem = { href: string; label: string };
export type PortalNavGroup = { id: string; label: string; items: PortalNavItem[] };

const ROLE_NAV: Record<PortalRole, PortalNavGroup[]> = {
  // Day-to-day → estate → commercial → ops.
  super_admin: [
    {
      id: "overview",
      label: "Overview",
      items: [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/pools", label: "Pools" },
        { href: "/dashboard/usage", label: "Usage" },
        { href: "/dashboard/alerts", label: "Alerts" },
      ],
    },
    {
      id: "estate",
      label: "Estate",
      items: [
        { href: "/dashboard/estate", label: "Estate" },
        { href: "/dashboard/estate/cc", label: "CC snapshot" },
        { href: "/dashboard/sims/rate-plan-changes", label: "Plan changes" },
      ],
    },
    {
      id: "commerce",
      label: "Commercial",
      items: [
        { href: "/dashboard/contracts", label: "Contract" },
        { href: "/dashboard/catalogue", label: "Catalogue" },
        { href: "/dashboard/plans", label: "Plans" },
        { href: "/dashboard/orders", label: "Orders" },
        { href: "/dashboard/invoices", label: "Invoices" },
      ],
    },
    {
      id: "ops",
      label: "Operations",
      items: [
        { href: "/dashboard/logs", label: "Logs" },
        { href: "/dashboard/admin", label: "Admin" },
      ],
    },
  ],
  // Same shape as super admin: day-to-day → SIMs → commercial → ops.
  reseller_admin: [
    {
      id: "overview",
      label: "Overview",
      items: [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/pools", label: "Pools" },
        { href: "/dashboard/usage", label: "Usage" },
        { href: "/dashboard/alerts", label: "Alerts" },
      ],
    },
    {
      id: "sims",
      label: "SIMs",
      items: [
        { href: "/dashboard/sims", label: "SIMs" },
        { href: "/dashboard/customers", label: "Customers" },
        { href: "/dashboard/sims/rate-plan-changes", label: "Plan changes" },
      ],
    },
    {
      id: "commerce",
      label: "Commercial",
      items: [
        { href: "/dashboard/contracts", label: "Contract" },
        { href: "/dashboard/plans", label: "Retail plans" },
        { href: "/dashboard/orders", label: "Orders" },
        { href: "/dashboard/invoices", label: "Invoices" },
      ],
    },
    {
      id: "ops",
      label: "Operations",
      items: [
        { href: "/dashboard/logs", label: "Logs" },
        { href: "/dashboard/settings", label: "Settings" },
      ],
    },
  ],
  reseller_operator: [
    {
      id: "overview",
      label: "Overview",
      items: [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/sims", label: "SIMs" },
        { href: "/dashboard/customers", label: "Customers" },
      ],
    },
  ],
};

export const VIEW_ROLES: { id: PortalRole; label: string }[] = [
  { id: "super_admin", label: "Super admin" },
  { id: "reseller_admin", label: "Reseller admin" },
  { id: "reseller_operator", label: "Reseller operator" },
];

export function can(role: PortalRole, privilege: Privilege): boolean {
  return ROLE_PRIVILEGES[role].includes(privilege);
}

export function simFieldsForRole(role: PortalRole) {
  return {
    tenantName: role === "super_admin",
    ccRatePlan: role === "super_admin",
    // SIM status column already shows live Jasper / CC status (ungrouped).
    ccStatus: false,
    platformPlan: role === "super_admin" || role === "reseller_admin",
  };
}

export function navForRole(role: PortalRole): PortalNavGroup[] {
  return ROLE_NAV[role];
}

/** Flat href list for a role (tests / redirects). */
export function navItemsForRole(role: PortalRole): PortalNavItem[] {
  return ROLE_NAV[role].flatMap((group) => group.items);
}

export function parseViewRole(raw: string | undefined | null): PortalRole | null {
  if (raw === "super_admin" || raw === "reseller_admin" || raw === "reseller_operator") return raw;
  return null;
}

export function effectiveRole(isSuperAdmin: boolean, viewAs: PortalRole | null): PortalRole {
  if (!isSuperAdmin) return "reseller_admin";
  return viewAs ?? "super_admin";
}
