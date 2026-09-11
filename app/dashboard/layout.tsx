import { requirePortal } from "@/lib/portal/guard";
import { PortalShell } from "@/components/portal/shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortal();
  return <PortalShell ctx={ctx}>{children}</PortalShell>;
}
