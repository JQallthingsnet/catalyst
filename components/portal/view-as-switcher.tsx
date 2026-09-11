"use client";

import { usePathname, useRouter } from "next/navigation";
import type { PortalRole } from "@/lib/portal/role-model";
import { VIEW_ROLES } from "@/lib/portal/role-model";

export function ViewAsSwitcher({ role }: { role: PortalRole }) {
  const router = useRouter();
  const pathname = usePathname();

  async function onChange(next: string) {
    await fetch("/api/portal/view-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    if (pathname.startsWith("/dashboard/admin") && next !== "super_admin") {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    router.refresh();
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
