"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PortalRole } from "@/lib/portal/role-model";
import { navForRole } from "@/lib/portal/role-model";

export function PortalNav({ role }: { role: PortalRole }) {
  const pathname = usePathname();
  const items = navForRole(role);

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
