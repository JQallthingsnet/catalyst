"use client";

import { useRouter } from "next/navigation";

export function TenantSwitcher({
  tenants,
  currentId,
}: {
  tenants: { id: string; name: string }[];
  currentId: string;
}) {
  const router = useRouter();

  async function onChange(tenantId: string) {
    await fetch("/api/portal/acting-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    router.refresh();
  }

  if (tenants.length === 0) return null;

  return (
    <label className="flex min-w-0 items-center gap-2 text-xs text-quiet">
      Org
      <select
        value={currentId}
        onChange={(event) => void onChange(event.target.value)}
        className="max-w-44 truncate rounded-xl border border-line bg-panel px-2 py-1.5 text-ink"
      >
        {tenants.map((tenant) => (
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
      body: JSON.stringify({ tenantId }),
    });
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
