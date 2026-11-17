"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalRole } from "@/lib/portal/role-model";
import { VIEW_ROLES } from "@/lib/portal/role-model";

const NEW_ORG = "__new__";

export function InviteForm({
  roles,
  allowNewOrganisation = false,
  organisations = [],
  /** When set (e.g. Contract detail), always invite into this org — no create/picker. */
  fixedOrganisationId,
  fixedOrganisationName,
}: {
  roles: PortalRole[];
  allowNewOrganisation?: boolean;
  organisations?: { id: string; name: string }[];
  fixedOrganisationId?: string;
  fixedOrganisationName?: string;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PortalRole>(roles[0] ?? "reseller_operator");
  const [organisationName, setOrganisationName] = useState("");
  const [organisationId, setOrganisationId] = useState("");
  const [adminOrgChoice, setAdminOrgChoice] = useState(NEW_ORG);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const fixedOrg = fixedOrganisationId?.trim() || "";
  const creatingOrg =
    !fixedOrg && allowNewOrganisation && role === "reseller_admin" && adminOrgChoice === NEW_ORG;
  const bindingAdminOrg =
    Boolean(fixedOrg) && role === "reseller_admin"
      ? true
      : !fixedOrg && allowNewOrganisation && role === "reseller_admin" && adminOrgChoice !== NEW_ORG;
  const bindingOperatorOrg =
    Boolean(fixedOrg) && role === "reseller_operator"
      ? true
      : !fixedOrg && allowNewOrganisation && role === "reseller_operator";
  const bindingOrg = bindingAdminOrg || bindingOperatorOrg;
  const newOrgName = creatingOrg ? organisationName.trim() : "";

  useEffect(() => {
    if (fixedOrg) {
      setOrganisationId(fixedOrg);
      setAdminOrgChoice(fixedOrg);
      return;
    }
    if (!organisations.length) {
      setOrganisationId("");
      setAdminOrgChoice(NEW_ORG);
      return;
    }
    setOrganisationId((current) =>
      current && organisations.some((org) => org.id === current) ? current : organisations[0].id,
    );
  }, [organisations, fixedOrg]);

  useEffect(() => {
    if (fixedOrg || role !== "reseller_admin") return;
    if (adminOrgChoice === NEW_ORG) return;
    if (!organisations.some((org) => org.id === adminOrgChoice)) {
      setAdminOrgChoice(organisations[0]?.id ?? NEW_ORG);
    }
  }, [role, adminOrgChoice, organisations, fixedOrg]);

  if (roles.length === 0) return null;

  async function submit() {
    setBusy(true);
    setError("");
    setOk("");
    const boundOrgId = fixedOrg
      ? fixedOrg
      : bindingOperatorOrg
        ? organisationId || organisations[0]?.id || ""
        : bindingAdminOrg
          ? adminOrgChoice
          : "";
    if (creatingOrg && !organisationName.trim()) {
      setError("Enter the organisation name. It is shown top left in their portal.");
      setBusy(false);
      return;
    }
    if (bindingOrg && !boundOrgId) {
      setError("Choose which reseller organisation this invite belongs to.");
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
          organisationId: bindingOrg ? boundOrgId : undefined,
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
        <button
          type="submit"
          disabled={busy}
          className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send invite"}
        </button>
      </div>
      {fixedOrg ? (
        <p className="text-xs text-quiet">
          Inviting into <span className="text-ink">{fixedOrganisationName || fixedOrg}</span>
          {role === "reseller_admin" ? " as reseller admin (backup allowed)." : null}
          {role === "reseller_operator" ? " as operator." : null}
        </p>
      ) : null}
      {!fixedOrg && allowNewOrganisation && role === "reseller_admin" ? (
        <label className="block text-sm">
          Organisation
          <select
            value={adminOrgChoice}
            onChange={(event) => setAdminOrgChoice(event.target.value)}
            className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
          >
            <option value={NEW_ORG}>Create new organisation…</option>
            {organisations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-quiet">
            Prefer creating the organisation on Contract first. Or pick an existing org for a backup
            reseller admin.
          </span>
        </label>
      ) : null}
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
            Must be unique. Shown top left in their portal, with “Supported by ATN Catalyst” underneath.
          </span>
        </label>
      ) : null}
      {!fixedOrg && bindingOperatorOrg ? (
        <label className="block text-sm">
          Reseller organisation
          {organisations.length === 0 ? (
            <p className="mt-2 text-sm text-danger">
              Create a reseller organisation on Contract first.
            </p>
          ) : (
            <select
              required
              value={organisationId || organisations[0]?.id || ""}
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
          <span className="mt-1 block text-xs text-quiet">
            Operators only see this organisation’s SIMs and customers.
          </span>
        </label>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {ok ? <p className="text-sm text-ok">{ok}</p> : null}
    </form>
  );
}
