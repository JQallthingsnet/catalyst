"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PortalRole } from "@/lib/portal/role-model";
import { navForRole } from "@/lib/portal/role-model";

function navItemMatches(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PortalNav({ role }: { role: PortalRole }) {
  const pathname = usePathname();
  const items = navForRole(role);
  // Longest matching href wins so nested routes (e.g. /estate/cc, /sims/rate-plan-changes)
  // highlight only their own nav item, not the parent.
  const activeHref = items
    .filter((item) => navItemMatches(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex-1 space-y-1 px-3">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
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
