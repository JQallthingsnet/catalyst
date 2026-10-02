"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalRole } from "@/lib/portal/role-model";
import { VIEW_ROLES } from "@/lib/portal/role-model";

export function InviteForm({
  roles,
  allowNewOrganisation = false,
  organisations = [],
}: {
  roles: PortalRole[];
  allowNewOrganisation?: boolean;
  organisations?: { id: string; name: string }[];
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PortalRole>(roles[0] ?? "reseller_operator");
  const [organisationName, setOrganisationName] = useState("");
  const [organisationId, setOrganisationId] = useState(organisations[0]?.id ?? "");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const creatingOrg = allowNewOrganisation && role === "reseller_admin";
  const bindingOrg = allowNewOrganisation && role === "reseller_operator";
  const newOrgName = creatingOrg ? organisationName.trim() : "";

  if (roles.length === 0) return null;

  async function submit() {
    setBusy(true);
    setError("");
    setOk("");
    if (creatingOrg && !organisationName.trim()) {
      setError("Enter the organisation name. It is shown top left in their portal.");
      setBusy(false);
      return;
    }
    if (bindingOrg && !organisationId) {
      setError("Choose which reseller organisation this operator belongs to.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/portal/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          role,
          organisationName: newOrgName || undefined,
          organisationId: bindingOrg ? organisationId : undefined,
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
      router.refresh();
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
        <button type="submit" disabled={busy} className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-40">
          {busy ? "Sending…" : "Send invite"}
        </button>
      </div>
      {creatingOrg ? (
        <label className="block text-sm">
          Organisation name
          <input
            required
            value={organisationName}
            onChange={(event) => setOrganisationName(event.target.value)}
            placeholder="Organisation or brand name"
            className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-quiet">
            Shown top left in their portal, with “Supported by ATN Catalyst” underneath.
          </span>
        </label>
      ) : null}
      {bindingOrg ? (
        <label className="block text-sm">
          Reseller organisation
          {organisations.length === 0 ? (
            <p className="mt-2 text-sm text-danger">Create a reseller first (invite a reseller admin with an organisation name).</p>
          ) : (
            <select
              required
              value={organisationId}
              onChange={(event) => setOrganisationId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
            >
              {organisations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          )}
          <span className="mt-1 block text-xs text-quiet">Operators only see this organisation’s SIMs and customers.</span>
        </label>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {ok ? <p className="text-sm text-ok">{ok}</p> : null}
    </form>
  );
}
