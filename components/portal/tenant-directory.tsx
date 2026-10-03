"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
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

function DeactivateOrgButton({ tenantId, name, active }: { tenantId: string; name: string; active: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = !active;

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, active: next }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Update failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        className={`text-sm disabled:opacity-40 ${active ? "text-danger" : "text-accent"}`}
      >
        {active ? "Deactivate" : "Reactivate"}
      </button>
      {error && !open ? <p className="text-xs text-danger">{error}</p> : null}
      <ConfirmDialog
        open={open}
        title={next ? `Reactivate ${name}?` : `Deactivate ${name}?`}
        body={
          next ? (
            <p>Members of this organisation will be able to sign in again with an invite email.</p>
          ) : (
            <p>
              Members will not be able to request a login code until you reactivate. Organisation data is kept. You can
              permanently delete later if needed.
            </p>
          )
        }
        confirmLabel={next ? "Reactivate" : "Deactivate"}
        tone={next ? "accent" : "danger"}
        busy={busy}
        error={error}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={() => void confirm()}
      />
    </div>
  );
}

function DeleteOrgButton({ tenantId, name }: { tenantId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm(typedName?: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/tenants", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, confirmName: typedName ?? "" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Delete failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        className="text-sm text-danger disabled:opacity-40"
      >
        Delete
      </button>
      {error && !open ? <p className="max-w-48 text-right text-xs text-danger">{error}</p> : null}
      <ConfirmDialog
        open={open}
        title={`Delete ${name}?`}
        body={
          <p>
            This permanently removes members, SIMs, customers, plans, orders, and invites for this organisation. The
            Control Center device copy is not deleted. This cannot be undone.
          </p>
        }
        confirmLabel="Delete permanently"
        tone="danger"
        busy={busy}
        error={error}
        requireName={name}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={(typed) => void confirm(typed)}
      />
    </div>
  );
}

export function TenantDirectory({
  tenants,
  currentId,
  canManage = false,
  canRename = false,
}: {
  tenants: PlatformTenant[];
  currentId: string;
  canManage?: boolean;
  /** @deprecated use canManage */
  canRename?: boolean;
}) {
  const manage = canManage || canRename;
  return (
    <article className="rounded-card border border-line bg-panel p-5">
      <h2 className="font-semibold">All organisations</h2>
      <p className="mt-1 text-sm text-quiet">
        Organisation totals. Estate shows every customer and SIM. Open an organisation to preview as that reseller.
        {manage
          ? " Rename updates the top-left brand. Deactivate blocks sign-in. Delete (after deactivate) permanently removes the org and its members."
          : null}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-quiet">
            <tr>
              <th className="pb-2 font-medium">Organisation</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">SIMs</th>
              <th className="pb-2 font-medium">Customers</th>
              <th className="pb-2 font-medium">Members</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-3 text-quiet">
                  No organisations yet.
                </td>
              </tr>
            ) : (
              tenants.map((tenant) => (
                <tr key={tenant.id} className="border-t border-line">
                  <td className="py-3">
                    <p className={tenant.active ? "text-ink" : "text-quiet"}>{tenant.name}</p>
                  </td>
                  <td className="py-3">
                    <span className={tenant.active ? "text-ok" : "text-danger"}>
                      {tenant.active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="py-3">{tenant.simCount}</td>
                  <td className="py-3">{tenant.customerCount}</td>
                  <td className="py-3">{tenant.memberCount}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      {manage ? <RenameOrgButton tenantId={tenant.id} name={tenant.name} /> : null}
                      {manage ? (
                        <DeactivateOrgButton tenantId={tenant.id} name={tenant.name} active={tenant.active} />
                      ) : null}
                      {manage && !tenant.active ? <DeleteOrgButton tenantId={tenant.id} name={tenant.name} /> : null}
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
