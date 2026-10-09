import Link from "next/link";
import { AllocateWizard } from "@/components/portal/allocate-wizard";
import { listCcCustomerStockOptions } from "@/lib/cc/devices";
import { requirePrivilege } from "@/lib/portal/guard";
import { listAllTenantPlanIds, listPlatformPlans } from "@/lib/portal/platform-plans";
import { listSimSkus } from "@/lib/portal/skus";
import { getResellerAdminEmail, listTenantOptions, loadTenant } from "@/lib/portal/tenant";

export default async function AllocateStockPage() {
  const ctx = await requirePrivilege("wholesale.allocate");
  const [resellers, plans, links, skus, customerOptions] = await Promise.all([
    listTenantOptions(),
    listPlatformPlans(),
    listAllTenantPlanIds(),
    listSimSkus(),
    listCcCustomerStockOptions(),
  ]);
  const linksByTenant = new Map<string, { platformPlanId: string; isDefault: boolean }[]>();
  for (const link of links) {
    const list = linksByTenant.get(link.tenantId) ?? [];
    list.push({ platformPlanId: link.platformPlanId, isDefault: link.isDefault });
    linksByTenant.set(link.tenantId, list);
  }

  const resellerRows = resellers.filter((item) => item.id !== ctx.homeTenantId);
  const resellerDetails = await Promise.all(
    resellerRows.map(async (item) => {
      const [tenant, adminEmail] = await Promise.all([loadTenant(item.id), getResellerAdminEmail(item.id)]);
      const tenantLinks = linksByTenant.get(item.id) ?? [];
      const defaultPlanId =
        tenantLinks.find((link) => link.isDefault)?.platformPlanId ?? tenantLinks[0]?.platformPlanId ?? "";
      return {
        id: item.id,
        name: item.name,
        planIds: tenantLinks.map((link) => link.platformPlanId),
        defaultPlanId,
        adminEmail,
        ccCustomer: tenant?.ccCustomer ?? null,
      };
    }),
  );

  return (
    <div>
      <Link href="/dashboard/estate" className="text-sm text-quiet hover:text-accent">
        ← Estate
      </Link>
      <div className="mt-4">
        <AllocateWizard
          resellers={resellerDetails}
          plans={plans.map((item) => ({
            id: item.id,
            name: `${item.ccRatePlan} · ${item.name}`,
          }))}
          skus={skus}
          customerOptions={customerOptions}
        />
      </div>
    </div>
  );
}
