import type { PortalContext } from "@/lib/portal/repo";
import { loadTenant } from "@/lib/portal/tenant";

/**
 * Super admin sees all CC customers.
 * Reseller sees only the Jasper/CC customer bound to their organisation (or none if unbound).
 */
export async function resolvePoolCustomerScope(
  ctx: Pick<PortalContext, "role" | "tenantId">,
): Promise<{ unrestricted: true } | { unrestricted: false; exactCustomer: string }> {
  if (ctx.role === "super_admin") return { unrestricted: true };
  const tenant = await loadTenant(ctx.tenantId);
  return { unrestricted: false, exactCustomer: tenant?.ccCustomer?.trim() ?? "" };
}
