"use client";

import { useRouter } from "next/navigation";
import type { PortalRole } from "@/lib/portal/role-model";

export function TenantSwitcher({
  tenants,
  currentId,
  homeTenantId,
  homeTenantName,
  role,
}: {
  tenants: { id: string; name: string }[];
  currentId: string;
  homeTenantId: string;
  homeTenantName: string;
  role: PortalRole;
}) {
  const router = useRouter();
  const resellers = tenants.filter((tenant) => tenant.id !== homeTenantId);

  async function onChange(tenantId: string) {
    await fetch("/api/portal/acting-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    router.refresh();
  }

  if (role === "super_admin") {
    return (
      <label className="flex min-w-0 items-center gap-2 text-xs text-quiet">
        Manage reseller
        <select
          value={homeTenantId}
          disabled
          className="max-w-44 truncate rounded-xl border border-line bg-panel px-2 py-1.5 text-ink disabled:opacity-70"
        >
          <option value={homeTenantId}>{homeTenantName}</option>
        </select>
      </label>
    );
  }

  if (resellers.length === 0) {
    return (
      <p className="hidden text-xs text-quiet lg:block">No reseller orgs yet</p>
    );
  }

  const value = resellers.some((tenant) => tenant.id === currentId) ? currentId : resellers[0].id;

  return (
    <label className="flex min-w-0 items-center gap-2 text-xs text-quiet">
      Manage reseller
      <select
        value={value}
        onChange={(event) => void onChange(event.target.value)}
        className="max-w-44 truncate rounded-xl border border-line bg-panel px-2 py-1.5 text-ink"
      >
        {resellers.map((tenant) => (
          <option key={tenant.id} value={tenant.id}>
            {tenant.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function OpenTenantButton({ tenantId, current }: { tenantId: string; current: boolean }) {
  const router = useRouter();

  async function open() {
    await fetch("/api/portal/acting-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, viewAsReseller: true }),
    });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={current}
      onClick={() => void open()}
      className="text-sm text-accent disabled:text-quiet"
    >
      {current ? "Current" : "Open"}
    </button>
  );
}
