export type PortalRole = "super_admin" | "reseller_admin" | "reseller_operator";

export const VIEW_AS_COOKIE = "catalyst_view_as";

export type Privilege =
  | "admin"
  | "order.create"
  | "plan.create"
  | "plan.edit"
  | "pool.view"
  | "pool.create"
  | "customer.create"
  | "assign"
  | "lifecycle"
  | "settings";

const ROLE_PRIVILEGES: Record<PortalRole, Privilege[]> = {
  super_admin: [
    "admin",
    "order.create",
    "plan.create",
    "plan.edit",
    "pool.view",
    "pool.create",
    "customer.create",
    "assign",
    "lifecycle",
    "settings",
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
  ],
  reseller_operator: ["plan.edit", "assign", "lifecycle"],
};

const ROLE_NAV: Record<PortalRole, { href: string; label: string }[]> = {
  super_admin: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/sims", label: "SIMs" },
    { href: "/dashboard/plans", label: "Plans" },
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
    { href: "/dashboard/plans", label: "Plans" },
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
