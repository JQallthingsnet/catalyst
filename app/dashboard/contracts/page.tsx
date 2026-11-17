import Link from "next/link";
import { ContractsAdminIndex } from "./admin-view";
import { ContractDocumentPanel } from "@/components/portal/contract-document-panel";
import { ContractRules } from "@/components/portal/contract-rules";
import { getContractDocumentMeta, listContractDocumentMetaByTenants } from "@/lib/portal/contract-documents";
import { requirePortal, requirePrivilege } from "@/lib/portal/guard";
import {
  listContractBook,
  listResellerContract,
  listResellerJasperCarriedPlans,
} from "@/lib/portal/platform-plans";
import { can } from "@/lib/portal/role-model";
import { listResellerSkus } from "@/lib/portal/skus";
import { redirect } from "next/navigation";

function formatAllowance(value: number | null | undefined, digits = 0): string {
  if (value == null || value === 0) return "PAYG";
  return value.toLocaleString("en-AU", { maximumFractionDigits: digits });
}

export default async function ContractsPage() {
  const ctx = await requirePortal();
  if (!can(ctx.role, "contract.view") && !can(ctx.role, "platform.plan")) redirect("/dashboard");

  // Reseller admin (or View as reseller admin): read-only signed lines + PDF for this org.
  if (ctx.role === "reseller_admin") {
    const [lines, carried, skus, document] = await Promise.all([
      listResellerContract(ctx.tenantId),
      listResellerJasperCarriedPlans(ctx.tenantId),
      listResellerSkus(ctx.tenantId),
      getContractDocumentMeta(ctx.tenantId).catch(() => null),
    ]);
    return (
      <div>
        <h1 className="text-3xl font-semibold">Contract</h1>
        <p className="mt-1 text-sm text-quiet">
          Your agreement with ATN for <span className="text-ink">{ctx.tenantName}</span>. These are the rate plans and
          catalogue products you may use. Create retail plans under{" "}
          <Link href="/dashboard/plans" className="text-accent">
            Plans
          </Link>{" "}
          to assign to each ICCID.
        </p>

        <ContractRules variant="reseller_admin" />

        <div className="mt-6">
          <ContractDocumentPanel
            tenantId={ctx.tenantId}
            meta={
              document
                ? {
                    fileName: document.fileName,
                    sizeBytes: document.sizeBytes,
                    uploadedAt: document.uploadedAt,
                    uploadedBy: document.uploadedBy,
                  }
                : null
            }
          />
        </div>

        <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
          <table className="w-full min-w-160 text-left text-sm">
            <thead className="border-b border-line text-quiet">
              <tr>
                <th className="px-4 py-3 font-medium">Reseller Plan</th>
                <th className="px-4 py-3 font-medium">Data MB</th>
                <th className="px-4 py-3 font-medium">SMS</th>
                <th className="px-4 py-3 font-medium">Voice (min)</th>
                <th className="px-4 py-3 font-medium">Default for bulk</th>
                <th className="px-4 py-3 font-medium">SIMs on line</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-quiet">
                    No Reseller Plans on contract yet. Ask ATN to add plans for your organisation.
                  </td>
                </tr>
              ) : null}
              {lines.map((line) => (
                <tr key={line.platformPlanId} className="border-t border-line">
                  <td className="px-4 py-3 text-ink">{line.remarks}</td>
                  <td className="px-4 py-3 font-mono text-xs">{formatAllowance(line.allowanceMb, 1)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{formatAllowance(line.allowanceSms)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{formatAllowance(line.allowanceVoiceMin)}</td>
                  <td className="px-4 py-3">{line.isDefault ? <span className="text-ok">Default</span> : "—"}</td>
                  <td className="px-4 py-3">{line.simCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-quiet">Inclusive allowance per SIM on each Reseller Plan. 0 / unset = PAYG. Set by ATN.</p>

        {carried.length > 0 ? (
          <section className="mt-8 space-y-2">
            <h2 className="text-lg font-semibold">Also on your SIMs (from Jasper)</h2>
            <p className="text-sm text-quiet">
              Reseller Plans mirrored from Jasper modem_ID that are not on this Contract yet. Allowances still apply
              on Pools, Usage, and Invoices. Ask ATN to bind them if you need Change plan / Order from these lines.
            </p>
            <div className="overflow-x-auto rounded-card border border-line bg-panel">
              <table className="w-full min-w-160 text-left text-sm">
                <thead className="border-b border-line text-quiet">
                  <tr>
                    <th className="px-4 py-3 font-medium">Reseller Plan</th>
                    <th className="px-4 py-3 font-medium">Data MB</th>
                    <th className="px-4 py-3 font-medium">SMS</th>
                    <th className="px-4 py-3 font-medium">Voice (min)</th>
                    <th className="px-4 py-3 font-medium">SIMs</th>
                  </tr>
                </thead>
                <tbody>
                  {carried.map((line) => (
                    <tr key={line.platformPlanId} className="border-t border-line">
                      <td className="px-4 py-3 text-ink">{line.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{formatAllowance(line.allowanceMb, 1)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{formatAllowance(line.allowanceSms)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{formatAllowance(line.allowanceVoiceMin)}</td>
                      <td className="px-4 py-3">{line.simCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <h2 className="mt-8 text-lg font-semibold">Catalogue (Order SIMs)</h2>
        <p className="mt-1 text-sm text-quiet">Products ATN allows your organisation to order.</p>
        <div className="mt-4 overflow-x-auto rounded-card border border-line bg-panel">
          <table className="w-full min-w-120 text-left text-sm">
            <thead className="border-b border-line text-quiet">
              <tr>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Form factor</th>
                <th className="px-4 py-3 font-medium">Tech</th>
                <th className="px-4 py-3 font-medium">Region</th>
              </tr>
            </thead>
            <tbody>
              {skus.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-quiet">
                    No catalogue SKUs on contract yet. Ask ATN to bind products for your organisation.
                  </td>
                </tr>
              ) : null}
              {skus.map((sku) => (
                <tr key={sku.skuId} className="border-t border-line">
                  <td className="px-4 py-3 text-ink">
                    {sku.name}
                    {!sku.active ? <span className="ml-2 text-xs text-danger">Unavailable</span> : null}
                  </td>
                  <td className="px-4 py-3 text-quiet">{sku.formFactor}</td>
                  <td className="px-4 py-3 text-quiet">{sku.tech}</td>
                  <td className="px-4 py-3 text-quiet">{sku.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-sm text-quiet">
          Need a change? Contact ATN — only ATN can add or remove rate plans and catalogue SKUs on this contract.
        </p>
      </div>
    );
  }

  await requirePrivilege("platform.plan");
  const book = await listContractBook(ctx.homeTenantId);
  const pdfMap = await listContractDocumentMetaByTenants(book.map((row) => row.tenantId)).catch(
    () => new Map(),
  );
  const signedPdfByTenant: Record<string, boolean> = {};
  for (const [id] of pdfMap) signedPdfByTenant[id] = true;
  return <ContractsAdminIndex book={book} signedPdfByTenant={signedPdfByTenant} />;
}
