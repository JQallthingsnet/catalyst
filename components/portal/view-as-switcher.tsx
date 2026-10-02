"use client";

import { usePathname } from "next/navigation";
import type { PortalRole } from "@/lib/portal/role-model";
import { VIEW_ROLES } from "@/lib/portal/role-model";

export function ViewAsSwitcher({ role }: { role: PortalRole }) {
  const pathname = usePathname();

  async function onChange(next: string) {
    const res = await fetch("/api/portal/view-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    if (!res.ok) return;
    const leavePlatform =
      next !== "super_admin" &&
      (pathname.startsWith("/dashboard/admin") ||
        pathname.startsWith("/dashboard/estate") ||
        pathname.startsWith("/dashboard/catalogue"));
    window.location.assign(leavePlatform ? "/dashboard" : pathname || "/dashboard");
  }

  return (
    <label className="hidden items-center gap-2 text-xs text-quiet lg:flex">
      View as
      <select
        value={role}
        onChange={(event) => void onChange(event.target.value)}
        className="rounded-xl border border-line bg-panel px-2 py-1.5 text-ink"
      >
        {VIEW_ROLES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
