import { InviteForm } from "@/components/portal/invite-form";
import { TenantDirectory } from "@/components/portal/tenant-directory";
import { requirePrivilege } from "@/lib/portal/guard";
import { inviteableRoles, listInvites } from "@/lib/portal/invites";
import { listSuperAdmins } from "@/lib/portal/roles";
import { VIEW_ROLES } from "@/lib/portal/role-model";
import { excludeHomeTenant, listPlatformTenants } from "@/lib/portal/tenant";

export default async function AdminPage() {
  const ctx = await requirePrivilege("admin");
  const [admins, invites, tenants] = await Promise.all([
    listSuperAdmins(),
    listInvites(ctx.tenantId),
    listPlatformTenants(ctx.isSuperAdmin),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-semibold">Admin</h1>
      <p className="mt-2 text-sm text-quiet">
        See every reseller organisation here. Invites go to the current organisation unless you name a new one.
        Use <span className="text-ink">View as</span> to preview reseller roles.
      </p>

      <div className="mt-6">
        <TenantDirectory tenants={excludeHomeTenant(tenants, ctx.homeTenantId)} currentId={ctx.tenantId} />
      </div>

      <article className="mt-6 rounded-card border border-line bg-panel p-5">
        <h2 className="font-semibold">Send invite</h2>
        <p className="mt-1 text-sm text-quiet">
          Super admin, reseller admin, or operator. For a new reseller, choose reseller admin and enter an
          organisation name.
        </p>
        <InviteForm roles={inviteableRoles(ctx.role)} allowNewOrganisation />
      </article>

      <article className="mt-6 rounded-card border border-line bg-panel p-5">
        <h2 className="font-semibold">Super admins</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {admins.map((admin) => (
            <li key={admin.email} className="flex justify-between rounded-xl border border-line px-3 py-2">
              <span>{admin.email}</span>
              <span className="text-quiet">added by {admin.addedBy}</span>
            </li>
          ))}
        </ul>
      </article>

      <article className="mt-6 rounded-card border border-line bg-panel p-5">
        <h2 className="font-semibold">Recent invites</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {invites.length === 0 ? <li className="text-quiet">None yet.</li> : null}
          {invites.map((invite) => (
            <li key={invite.id} className="flex justify-between rounded-xl border border-line px-3 py-2">
              <span>
                {invite.email} · {VIEW_ROLES.find((item) => item.id === invite.role)?.label}
              </span>
              <span className="text-quiet">{invite.invitedBy}</span>
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}
