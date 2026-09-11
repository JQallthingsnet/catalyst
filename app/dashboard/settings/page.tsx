import { InviteForm } from "@/components/portal/invite-form";
import { NameForm } from "@/components/portal/name-form";
import { requirePrivilege } from "@/lib/portal/guard";
import { inviteableRoles, listInvites, listTenantMembers } from "@/lib/portal/invites";
import { VIEW_ROLES } from "@/lib/portal/role-model";

export default async function SettingsPage() {
  const ctx = await requirePrivilege("settings");
  const roles = inviteableRoles(ctx.role);
  const [members, invites] = await Promise.all([listTenantMembers(ctx.tenantId), listInvites(ctx.tenantId)]);

  return (
    <div>
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-quiet">
        Tenant {ctx.tenantId} · Viewing as {ctx.role.replace(/_/g, " ")}
        {ctx.isSuperAdmin ? " (you are a super admin)" : ""}
      </p>
      <article className="mt-6 rounded-card border border-line bg-panel p-5">
        <h2 className="font-semibold">Organisation name</h2>
        <p className="mt-1 text-sm text-quiet">Shown in the top bar. Currently {ctx.tenantName}.</p>
        <div className="mt-4">
          <NameForm kind="tenant" placeholder={ctx.tenantName} button="Save name" />
        </div>
      </article>

      {roles.length > 0 ? (
        <article className="mt-4 rounded-card border border-line bg-panel p-5">
          <h2 className="font-semibold">Invite team</h2>
          <p className="mt-1 text-sm text-quiet">
            Reseller admins invite operators. Super admins can also invite reseller admins. An email is sent with a sign-in
            link.
          </p>
          <InviteForm roles={roles} />
          <ul className="mt-4 space-y-2 text-sm">
            {members.map((member) => (
              <li key={member.email} className="flex justify-between rounded-xl border border-line px-3 py-2">
                <span>{member.email}</span>
                <span className="text-quiet">{VIEW_ROLES.find((item) => item.id === member.role)?.label ?? member.role}</span>
              </li>
            ))}
          </ul>
          {invites.length > 0 ? (
            <p className="mt-3 text-xs text-quiet">Last invite: {invites[0].email}</p>
          ) : null}
        </article>
      ) : null}

      <article className="mt-4 rounded-card border border-line bg-panel p-5 text-sm leading-6 text-quiet">
        Control Center sandbox mapping and CSS tokens are Phase 0. Live CC mutations run as idempotent jobs with a
        correlation id. This portal does not bind to Cisco Catalyst Center or Webex Control Hub.
      </article>
    </div>
  );
}
