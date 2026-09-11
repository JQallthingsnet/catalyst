"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalRole } from "@/lib/portal/role-model";
import { VIEW_ROLES } from "@/lib/portal/role-model";

export function InviteForm({ roles, allowNewOrganisation = false }: { roles: PortalRole[]; allowNewOrganisation?: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PortalRole>(roles[0] ?? "reseller_operator");
  const [organisationName, setOrganisationName] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const creatingOrg = allowNewOrganisation && role === "reseller_admin";
  const newOrgName = creatingOrg ? organisationName.trim() : "";

  if (roles.length === 0) return null;

  async function submit() {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/portal/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          role,
          organisationName: newOrgName || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Invite failed.");
        return;
      }
      setEmail("");
      setOrganisationName("");
      setOk(`Invite email sent to ${email}.`);
      if (newOrgName) router.refresh();
    } catch {
      setError("Invite failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
          className="min-w-56 flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as PortalRole)}
          className="rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
        >
          {roles.map((id) => (
            <option key={id} value={id}>
              {VIEW_ROLES.find((item) => item.id === id)?.label ?? id}
            </option>
          ))}
        </select>
        <button type="submit" disabled={busy} className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-canvas disabled:opacity-40">
          {busy ? "Sending…" : "Send invite"}
        </button>
      </div>
      {creatingOrg ? (
        <input
          value={organisationName}
          onChange={(event) => setOrganisationName(event.target.value)}
          placeholder="New organisation name (optional)"
          className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
        />
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {ok ? <p className="text-sm text-ok">{ok}</p> : null}
    </form>
  );
}
