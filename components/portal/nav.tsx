"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/sims", label: "SIMs" },
  { href: "/dashboard/plans", label: "Plans" },
  { href: "/dashboard/pools", label: "Pools" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/usage", label: "Usage" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function PortalNav({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname();
  const items = showAdmin ? [...NAV, { href: "/dashboard/admin", label: "Admin" }] : NAV;

  return (
    <nav className="flex-1 space-y-1 px-3">
      {items.map((item) => {
        const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-xl px-3 py-2 text-sm ${
              active ? "bg-panel-2 text-accent" : "text-quiet hover:bg-panel-2 hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
