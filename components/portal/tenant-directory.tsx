"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OpenTenantButton } from "@/components/portal/tenant-switcher";
import type { PlatformTenant } from "@/lib/portal/tenant";

function RenameOrgButton({ tenantId, name }: { tenantId: string; name: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, name: value }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Rename failed.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Rename failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-sm text-quiet hover:text-accent">
        Rename
      </button>
    );
  }

  return (
    <div className="flex min-w-48 flex-col items-end gap-1">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-40 rounded-xl border border-line bg-canvas px-2 py-1 text-sm text-ink"
          autoFocus
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="text-sm text-accent disabled:opacity-40"
        >
          {busy ? "…" : "Save"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setValue(name);
            setEditing(false);
            setError("");
          }}
          className="text-sm text-quiet"
        >
          Cancel
        </button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function TenantDirectory({
  tenants,
  currentId,
  canRename = false,
}: {
  tenants: PlatformTenant[];
  currentId: string;
  canRename?: boolean;
}) {
  return (
    <article className="rounded-card border border-line bg-panel p-5">
      <h2 className="font-semibold">All organisations</h2>
      <p className="mt-1 text-sm text-quiet">
        Organisation totals. Estate shows every customer and SIM. Open an organisation to preview as that reseller.
        {canRename ? " Rename updates the name shown top left in their portal." : null}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-quiet">
            <tr>
              <th className="pb-2 font-medium">Organisation</th>
              <th className="pb-2 font-medium">SIMs</th>
              <th className="pb-2 font-medium">Customers</th>
              <th className="pb-2 font-medium">Members</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-quiet">
                  No organisations yet.
                </td>
              </tr>
            ) : (
              tenants.map((tenant) => (
                <tr key={tenant.id} className="border-t border-line">
                  <td className="py-3">
                    <p className="text-ink">{tenant.name}</p>
                    <p className="text-xs text-quiet">{tenant.id}</p>
                  </td>
                  <td className="py-3">{tenant.simCount}</td>
                  <td className="py-3">{tenant.customerCount}</td>
                  <td className="py-3">{tenant.memberCount}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      {canRename ? <RenameOrgButton tenantId={tenant.id} name={tenant.name} /> : null}
                      <OpenTenantButton tenantId={tenant.id} current={tenant.id === currentId} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
