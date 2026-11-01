import { notFound } from "next/navigation";
import { ContractResellerDetail } from "@/app/dashboard/contracts/admin-view";
import { requirePrivilege } from "@/lib/portal/guard";
import { listContractBook, listPlatformPlans } from "@/lib/portal/platform-plans";
import { listSimSkus } from "@/lib/portal/skus";

export default async function ContractTenantPage({
  params,
}: {
  params: { tenantId: string } | Promise<{ tenantId: string }>;
}) {
  const ctx = await requirePrivilege("platform.plan");
  const { tenantId } = await Promise.resolve(params);
  const [book, allPlans, catalogue] = await Promise.all([
    listContractBook(ctx.homeTenantId),
    listPlatformPlans(),
    listSimSkus({ activeOnly: true }),
  ]);
  const entry = book.find((row) => row.tenantId === tenantId);
  if (!entry) notFound();

  return (
    <ContractResellerDetail
      entry={entry}
      plans={allPlans.filter((plan) => plan.active)}
      catalogue={catalogue}
    />
  );
}
