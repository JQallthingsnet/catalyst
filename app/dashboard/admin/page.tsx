import { AddSuperAdminForm } from "@/components/portal/add-super-admin-form";
import { requirePrivilege } from "@/lib/portal/guard";
import { listSuperAdmins } from "@/lib/portal/roles";

export default async function AdminPage() {
  const ctx = await requirePrivilege("admin");
  const admins = await listSuperAdmins();

  return (
    <div>
      <h1 className="text-3xl font-semibold">Admin</h1>
      <p className="mt-2 text-sm text-quiet">
        ATN ops. Add other super admins here. Use <span className="text-ink">View as</span> in the header to preview
        reseller admin or operator.
      </p>

      <article className="mt-6 rounded-card border border-line bg-panel p-5">
        <h2 className="font-semibold">Super admins</h2>
        <p className="mt-1 text-sm text-quiet">Signed in as {ctx.email}. They can sign in with a passcode like anyone else.</p>
        <ul className="mt-4 space-y-2 text-sm">
          {admins.map((admin) => (
            <li key={admin.email} className="flex justify-between rounded-xl border border-line px-3 py-2">
              <span>{admin.email}</span>
              <span className="text-quiet">added by {admin.addedBy}</span>
            </li>
          ))}
        </ul>
        <AddSuperAdminForm />
      </article>
    </div>
  );
}
