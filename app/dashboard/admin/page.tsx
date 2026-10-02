import { InviteForm } from "@/components/portal/invite-form";
import { TenantDirectory } from "@/components/portal/tenant-directory";
import { requirePrivilege } from "@/lib/portal/guard";
import { inviteableRoles, listAllInvites } from "@/lib/portal/invites";
import { listSuperAdmins } from "@/lib/portal/roles";
import { VIEW_ROLES } from "@/lib/portal/role-model";
import { excludeHomeTenant, listPlatformTenants } from "@/lib/portal/tenant";
import { formatAuDateTime } from "@/lib/portal/time";

export default async function AdminPage() {
  const ctx = await requirePrivilege("admin");
  const [admins, invites, tenants] = await Promise.all([
    listSuperAdmins(),
    listAllInvites(50),
    listPlatformTenants(ctx.isSuperAdmin),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-semibold">Admin</h1>
      <p className="mt-2 text-sm text-quiet">
        Manage every reseller here: rename (same as their Settings organisation name), Open to preview as that
        reseller, and send invites. Use <span className="text-ink">View as</span> Reseller admin to use their
        Settings for that org only.
      </p>

      <div className="mt-6">
        <TenantDirectory
          tenants={excludeHomeTenant(tenants, ctx.homeTenantId)}
          currentId={ctx.tenantId}
          canManage
        />
      </div>

      <article className="mt-6 rounded-card border border-line bg-panel p-5">
        <h2 className="font-semibold">Send invite</h2>
        <p className="mt-1 text-sm text-quiet">
          Super admin joins ATN Platform. Reseller admin creates a new organisation (name shown top left). Operator
          must be bound to an existing reseller.
        </p>
        <InviteForm
          roles={inviteableRoles(ctx.role)}
          allowNewOrganisation
          organisations={excludeHomeTenant(tenants, ctx.homeTenantId)
            .filter((item) => item.active)
            .map((item) => ({
              id: item.id,
              name: item.name,
            }))}
        />
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
        <p className="mt-1 text-sm text-quiet">
          All organisations — including invites sent by reseller admins from Settings.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {invites.length === 0 ? <li className="text-quiet">None yet.</li> : null}
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-line px-3 py-2">
              <div>
                <p>
                  {invite.email} · {VIEW_ROLES.find((item) => item.id === invite.role)?.label}
                </p>
                <p className="mt-0.5 text-xs text-quiet">
                  {invite.tenantName ?? "—"} · {formatAuDateTime(invite.createdAt)}
                </p>
              </div>
              <span className="text-quiet">by {invite.invitedBy}</span>
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}
