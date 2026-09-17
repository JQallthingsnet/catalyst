export type PortalRole = "super_admin" | "reseller_admin" | "reseller_operator";

export const VIEW_AS_COOKIE = "catalyst_view_as";
export const ACTING_TENANT_COOKIE = "catalyst_acting_tenant";

export type Privilege =
  | "admin"
  | "platform.estate"
  | "wholesale.allocate"
  | "platform.plan"
  | "platform.catalogue"
  | "order.create"
  | "plan.create"
  | "plan.edit"
  | "pool.view"
  | "pool.create"
  | "customer.create"
  | "assign"
  | "lifecycle"
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
    "order.create",
    "plan.create",
    "plan.edit",
    "pool.view",
    "pool.create",
    "customer.create",
    "assign",
    "lifecycle",
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
    "settings",
    "invite.operator",
  ],
  reseller_operator: ["assign", "lifecycle"],
};

const ROLE_NAV: Record<PortalRole, { href: string; label: string }[]> = {
  super_admin: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/estate", label: "Estate" },
    { href: "/dashboard/estate/cc", label: "CC snapshot" },
    { href: "/dashboard/sims", label: "SIMs" },
    { href: "/dashboard/plans", label: "Plans" },
    { href: "/dashboard/catalogue", label: "Catalogue" },
    { href: "/dashboard/pools", label: "Pools" },
    { href: "/dashboard/customers", label: "Customers" },
    { href: "/dashboard/orders", label: "Orders" },
    { href: "/dashboard/usage", label: "Usage" },
    { href: "/dashboard/settings", label: "Settings" },
    { href: "/dashboard/admin", label: "Admin" },
  ],
  reseller_admin: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/sims", label: "SIMs" },
    { href: "/dashboard/plans", label: "Plans" },
    { href: "/dashboard/pools", label: "Pools" },
    { href: "/dashboard/customers", label: "Customers" },
    { href: "/dashboard/orders", label: "Orders" },
    { href: "/dashboard/usage", label: "Usage" },
    { href: "/dashboard/settings", label: "Settings" },
  ],
  reseller_operator: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/sims", label: "SIMs" },
    { href: "/dashboard/customers", label: "Customers" },
    { href: "/dashboard/usage", label: "Usage" },
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
    ccStatus: role === "super_admin",
    platformPlan: role === "super_admin" || role === "reseller_admin",
  };
}

export function navForRole(role: PortalRole) {
  return ROLE_NAV[role];
}

export function parseViewRole(raw: string | undefined | null): PortalRole | null {
  if (raw === "super_admin" || raw === "reseller_admin" || raw === "reseller_operator") return raw;
  return null;
}

export function effectiveRole(isSuperAdmin: boolean, viewAs: PortalRole | null): PortalRole {
  if (!isSuperAdmin) return "reseller_admin";
  return viewAs ?? "super_admin";
}
