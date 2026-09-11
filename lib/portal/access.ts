import { getOrCreatePortalContext, type PortalContext } from "@/lib/portal/repo";
import { effectiveRole, getActingTenantCookie, getViewAsCookie, isListedSuperAdmin } from "@/lib/portal/roles";
import { loadTenant } from "@/lib/portal/tenant";

export async function resolvePortalContext(email: string): Promise<PortalContext> {
  const home = await getOrCreatePortalContext(email);
  const isSuperAdmin = await isListedSuperAdmin(email);
  const viewAs = isSuperAdmin ? await getViewAsCookie() : null;
  const actingId = isSuperAdmin ? await getActingTenantCookie() : null;
  const acting = actingId ? await loadTenant(actingId) : null;

  return {
    ...home,
    isSuperAdmin,
    role: isSuperAdmin ? effectiveRole(true, viewAs) : home.role,
    tenantId: acting?.id ?? home.homeTenantId,
    tenantName: acting?.name ?? home.homeTenantName,
  };
}
