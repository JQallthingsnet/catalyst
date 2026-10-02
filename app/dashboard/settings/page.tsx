import Link from "next/link";
import { redirect } from "next/navigation";
import { InviteForm } from "@/components/portal/invite-form";
import { NameForm } from "@/components/portal/name-form";
import { requirePrivilege } from "@/lib/portal/guard";
import { inviteableRoles, listInvites, listTenantMembers } from "@/lib/portal/invites";
import { VIEW_ROLES } from "@/lib/portal/role-model";

export default async function SettingsPage() {
  const ctx = await requirePrivilege("settings");

  // Platform invites and org renames live on Admin — avoid a second confusing Settings there.
  if (ctx.role === "super_admin") {
    redirect("/dashboard/admin");
  }

  const roles = inviteableRoles(ctx.role);
  const [members, invites] = await Promise.all([listTenantMembers(ctx.tenantId), listInvites(ctx.tenantId)]);

  return (
    <div>
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-quiet">
        {ctx.tenantName}
        {ctx.isSuperAdmin ? " · Previewing as reseller admin" : ""}
      </p>

      <article className="mt-6 rounded-card border border-line bg-panel p-5">
        <h2 className="font-semibold">Organisation name</h2>
        <p className="mt-1 text-sm text-quiet">
          Shown top left in your portal (with “Supported by ATN Catalyst”). Currently {ctx.tenantName}.
        </p>
        <div className="mt-4">
          <NameForm kind="tenant" placeholder={ctx.tenantName} button="Save name" />
        </div>
      </article>

      {roles.length > 0 ? (
        <article className="mt-4 rounded-card border border-line bg-panel p-5">
          <h2 className="font-semibold">Invite team</h2>
          <p className="mt-1 text-sm text-quiet">
            Invite operators into <span className="text-ink">{ctx.tenantName}</span>. They only see this
            organisation’s SIMs and customers.
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

      {ctx.isSuperAdmin ? (
        <p className="mt-4 text-sm text-quiet">
          To create another reseller or invite an operator into a different org, use{" "}
          <Link href="/dashboard/admin" className="text-accent">
            Admin
          </Link>{" "}
          (switch View as back to Super admin).
        </p>
      ) : null}
    </div>
  );
}
