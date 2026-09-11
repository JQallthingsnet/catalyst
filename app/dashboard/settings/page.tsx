import { NameForm } from "@/components/portal/name-form";
import { requirePortal } from "@/lib/portal/guard";

export default async function SettingsPage() {
  const ctx = await requirePortal();
  return (
    <div>
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-quiet">Tenant {ctx.tenantId} · Role {ctx.role.replace("_", " ")}</p>
      <article className="mt-6 rounded-card border border-line bg-panel p-5">
        <h2 className="font-semibold">Organisation name</h2>
        <p className="mt-1 text-sm text-quiet">Shown in the top bar. Currently {ctx.tenantName}.</p>
        <div className="mt-4">
          <NameForm kind="tenant" placeholder={ctx.tenantName} button="Save name" />
        </div>
      </article>
      <article className="mt-4 rounded-card border border-line bg-panel p-5 text-sm leading-6 text-quiet">
        Control Center sandbox mapping and CSS tokens are Phase 0. Live CC mutations run as idempotent jobs with a
        correlation id. This portal does not bind to Cisco Catalyst Center or Webex Control Hub.
      </article>
    </div>
  );
}
