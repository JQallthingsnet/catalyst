"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { PortalNavGroup, PortalRole } from "@/lib/portal/role-model";
import { navForRole } from "@/lib/portal/role-model";

function navItemMatches(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function activeHrefFor(pathname: string, groups: PortalNavGroup[]) {
  const items = groups.flatMap((group) => group.items);
  // Longest matching href wins so nested routes (e.g. /estate/cc, /sims/rate-plan-changes)
  // highlight only their own nav item, not the parent.
  return items
    .filter((item) => navItemMatches(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

function groupsOpenFor(pathname: string, groups: PortalNavGroup[]) {
  const open = new Set<string>(["overview"]);
  const activeHref = activeHrefFor(pathname, groups);
  if (!activeHref) return open;
  for (const group of groups) {
    if (group.items.some((item) => item.href === activeHref)) open.add(group.id);
  }
  return open;
}

export function PortalNav({ role }: { role: PortalRole }) {
  const pathname = usePathname();
  const groups = navForRole(role);
  const activeHref = useMemo(() => activeHrefFor(pathname, groups), [pathname, groups]);
  const [openIds, setOpenIds] = useState(() => groupsOpenFor(pathname, groups));

  useEffect(() => {
    setOpenIds((current) => {
      const next = new Set(current);
      next.add("overview");
      for (const group of groups) {
        if (group.items.some((item) => item.href === activeHref)) next.add(group.id);
      }
      return next;
    });
  }, [pathname, groups, activeHref]);

  function toggleGroup(id: string) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <nav className="flex-1 space-y-3 overflow-y-auto px-3 pb-4">
      {groups.map((group) => {
        const open = openIds.has(group.id);
        const groupActive = group.items.some((item) => item.href === activeHref);
        return (
          <div key={group.id}>
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              aria-expanded={open}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-left text-xs font-semibold ${
                groupActive ? "text-accent" : "text-quiet hover:text-ink"
              }`}
            >
              <span>{group.label}</span>
              <span className={`text-[10px] transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
                ›
              </span>
            </button>
            {open ? (
              <div className="mt-1 space-y-0.5">
                {group.items.map((item) => {
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
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
