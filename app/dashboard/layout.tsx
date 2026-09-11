import { requirePortal } from "@/lib/portal/guard";
import { PortalShell } from "@/components/portal/shell";
import { listTenantOptions } from "@/lib/portal/tenant";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortal();
  const tenants = ctx.isSuperAdmin ? await listTenantOptions() : [];
  return (
    <PortalShell ctx={ctx} tenants={tenants}>
      {children}
    </PortalShell>
  );
}
