import { getOrCreatePortalContext, type PortalContext } from "@/lib/portal/repo";
import {
  clearActingTenantCookie,
  effectiveRole,
  getActingTenantCookie,
  getViewAsCookie,
  isListedSuperAdmin,
  setActingTenantCookie,
} from "@/lib/portal/roles";
import { excludeHomeTenant, listTenantOptions, loadTenant } from "@/lib/portal/tenant";

export async function resolvePortalContext(email: string): Promise<PortalContext> {
  const home = await getOrCreatePortalContext(email);
  const isSuperAdmin = await isListedSuperAdmin(email);
  const viewAs = isSuperAdmin ? await getViewAsCookie() : null;
  const role = isSuperAdmin ? effectiveRole(true, viewAs) : home.role;

  if (!isSuperAdmin) {
    return { ...home, isSuperAdmin: false, role: home.role };
  }

  // Super admin view: always ATN Platform. Ignore any leftover acting-tenant cookie.
  if (role === "super_admin") {
    const actingId = await getActingTenantCookie();
    if (actingId) await clearActingTenantCookie();
    return {
      ...home,
      isSuperAdmin: true,
      role: "super_admin",
      tenantId: home.homeTenantId,
      tenantName: home.homeTenantName,
    };
  }

  // Reseller preview: must act as a reseller org, never ATN Platform.
  const actingId = await getActingTenantCookie();
  const acting = actingId && actingId !== home.homeTenantId ? await loadTenant(actingId) : null;
  if (acting) {
    return {
      ...home,
      isSuperAdmin: true,
      role,
      tenantId: acting.id,
      tenantName: acting.name,
    };
  }

  const resellers = excludeHomeTenant(await listTenantOptions(), home.homeTenantId);
  const fallback = resellers[0] ? await loadTenant(resellers[0].id) : null;
  if (fallback) {
    await setActingTenantCookie(fallback.id);
    return {
      ...home,
      isSuperAdmin: true,
      role,
      tenantId: fallback.id,
      tenantName: fallback.name,
    };
  }

  await clearActingTenantCookie();
  return {
    ...home,
    isSuperAdmin: true,
    role,
    tenantId: home.homeTenantId,
    tenantName: home.homeTenantName,
  };
}
