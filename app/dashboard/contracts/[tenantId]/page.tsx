import { notFound } from "next/navigation";
import { ContractResellerDetail } from "@/app/dashboard/contracts/admin-view";
import { getContractDocumentMeta } from "@/lib/portal/contract-documents";
import { requirePrivilege } from "@/lib/portal/guard";
import { inviteableRoles, listTenantMembers } from "@/lib/portal/invites";
import { listContractBook, listPlatformPlans } from "@/lib/portal/platform-plans";
import { listSimSkus } from "@/lib/portal/skus";

export default async function ContractTenantPage({
  params,
}: {
  params: { tenantId: string } | Promise<{ tenantId: string }>;
}) {
  const ctx = await requirePrivilege("platform.plan");
  const { tenantId } = await Promise.resolve(params);
  const [book, allPlans, catalogue, members, document] = await Promise.all([
    listContractBook(ctx.homeTenantId),
    listPlatformPlans(),
    listSimSkus({ activeOnly: true }),
    listTenantMembers(tenantId),
    getContractDocumentMeta(tenantId).catch(() => null),
  ]);
  const entry = book.find((row) => row.tenantId === tenantId);
  if (!entry) notFound();

  return (
    <ContractResellerDetail
      entry={entry}
      plans={allPlans.filter((plan) => plan.active)}
      catalogue={catalogue}
      documentMeta={
        document
          ? {
              fileName: document.fileName,
              sizeBytes: document.sizeBytes,
              uploadedAt: document.uploadedAt,
              uploadedBy: document.uploadedBy,
            }
          : null
      }
      members={members}
      inviteRoles={inviteableRoles(ctx.role)}
    />
  );
}
