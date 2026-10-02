import Link from "next/link";
import { AllocateWizard } from "@/components/portal/allocate-wizard";
import { countAvailableCcStock } from "@/lib/cc/devices";
import { requirePrivilege } from "@/lib/portal/guard";
import { listAllTenantPlanIds, listPlatformPlans } from "@/lib/portal/platform-plans";
import { listSimSkus } from "@/lib/portal/skus";
import { listTenantOptions } from "@/lib/portal/tenant";

export default async function AllocateStockPage() {
  const ctx = await requirePrivilege("wholesale.allocate");
  const [resellers, plans, links, skus] = await Promise.all([
    listTenantOptions(),
    listPlatformPlans(),
    listAllTenantPlanIds(),
    listSimSkus(),
  ]);
  const linksByTenant = new Map<string, { platformPlanId: string; isDefault: boolean }[]>();
  for (const link of links) {
    const list = linksByTenant.get(link.tenantId) ?? [];
    list.push({ platformPlanId: link.platformPlanId, isDefault: link.isDefault });
    linksByTenant.set(link.tenantId, list);
  }
  const availableEntries = await Promise.all(
    plans.map(async (plan) => [plan.id, await countAvailableCcStock(plan.ccRatePlan, plan.commPlan)] as const),
  );
  const availableByPlanId = Object.fromEntries(availableEntries);

  return (
    <div>
      <Link href="/dashboard/estate" className="text-sm text-quiet hover:text-accent">
        ← Estate
      </Link>
      <div className="mt-4">
        <AllocateWizard
          resellers={resellers
            .filter((item) => item.id !== ctx.homeTenantId)
            .map((item) => {
              const tenantLinks = linksByTenant.get(item.id) ?? [];
              const defaultPlanId =
                tenantLinks.find((link) => link.isDefault)?.platformPlanId ?? tenantLinks[0]?.platformPlanId ?? "";
              return {
                id: item.id,
                name: item.name,
                planIds: tenantLinks.map((link) => link.platformPlanId),
                defaultPlanId,
              };
            })}
          plans={plans.map((item) => ({
            id: item.id,
            name: `${item.ccRatePlan} · ${item.name}`,
            available: availableByPlanId[item.id] ?? 0,
          }))}
          skus={skus}
        />
      </div>
    </div>
  );
}
