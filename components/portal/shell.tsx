import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { PortalNav } from "@/components/portal/nav";
import { TenantSwitcher } from "@/components/portal/tenant-switcher";
import { ViewAsSwitcher } from "@/components/portal/view-as-switcher";
import type { PortalContext } from "@/lib/portal/repo";

export function PortalShell({
  ctx,
  tenants,
  children,
}: {
  ctx: PortalContext;
  tenants: { id: string; name: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line bg-panel md:flex md:flex-col">
        <div className="px-5 py-6">
          {ctx.role === "super_admin" ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">ATN Catalyst</p>
              <p className="mt-2 text-sm text-quiet">ATN operations</p>
            </>
          ) : (
            <>
              <p className="truncate text-base font-semibold tracking-tight text-ink" title={ctx.tenantName}>
                {ctx.tenantName}
              </p>
              <p className="mt-1 text-xs text-quiet">
                {ctx.role === "reseller_operator" ? "Operator · " : ""}
                Supported by ATN Catalyst
              </p>
            </>
          )}
        </div>
        <PortalNav role={ctx.role} />
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-10 border-b border-line bg-canvas/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
            <form action="/dashboard/sims" className="min-w-0 flex-1">
              <input
                name="q"
                placeholder="Search ICCID / customer"
                className="w-full rounded-card border border-line bg-panel px-4 py-2.5 text-sm text-ink outline-none placeholder:text-quiet focus:border-accent"
              />
            </form>
            {ctx.isSuperAdmin && ctx.role !== "super_admin" ? (
              <TenantSwitcher
                tenants={tenants}
                currentId={ctx.tenantId}
                homeTenantId={ctx.homeTenantId}
              />
            ) : null}
            {ctx.isSuperAdmin ? <ViewAsSwitcher role={ctx.role} /> : null}
            <p className="hidden truncate text-sm text-quiet sm:block">{ctx.tenantName}</p>
            <p className="hidden truncate text-xs text-quiet lg:block">{ctx.email}</p>
            <SignOutButton />
          </div>
        </header>
        <div className="px-4 py-6 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
