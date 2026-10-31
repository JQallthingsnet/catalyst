import Link from "next/link";
import { ContractRules } from "@/components/portal/contract-rules";
import { ContractsAdminView } from "./admin-view";
import { requirePortal, requirePrivilege } from "@/lib/portal/guard";
import { listContractBook, listPlatformPlans, listResellerContract } from "@/lib/portal/platform-plans";
import { can } from "@/lib/portal/role-model";
import { listResellerSkus, listSimSkus } from "@/lib/portal/skus";
import { redirect } from "next/navigation";

export default async function ContractsPage() {
  const ctx = await requirePortal();
  if (!can(ctx.role, "contract.view") && !can(ctx.role, "platform.plan")) redirect("/dashboard");

  // Reseller admin (or View as reseller admin): read-only signed lines for this org.
  if (ctx.role === "reseller_admin") {
    const [lines, skus] = await Promise.all([
      listResellerContract(ctx.tenantId),
      listResellerSkus(ctx.tenantId),
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

        <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
          <table className="w-full min-w-160 text-left text-sm">
            <thead className="border-b border-line text-quiet">
              <tr>
                <th className="px-4 py-3 font-medium">Reseller Plan</th>
                <th className="px-4 py-3 font-medium">Default for bulk</th>
                <th className="px-4 py-3 font-medium">SIMs on line</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-quiet">
                    No Reseller Plans on contract yet. Ask ATN to add plans for your organisation.
                  </td>
                </tr>
              ) : null}
              {lines.map((line) => (
                <tr key={line.platformPlanId} className="border-t border-line">
                  <td className="px-4 py-3 text-ink">{line.remarks}</td>
                  <td className="px-4 py-3">{line.isDefault ? <span className="text-ok">Default</span> : "—"}</td>
                  <td className="px-4 py-3">{line.simCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
  const [book, allPlans, catalogue] = await Promise.all([
    listContractBook(ctx.homeTenantId),
    listPlatformPlans(),
    listSimSkus({ activeOnly: true }),
  ]);
  return (
    <ContractsAdminView book={book} plans={allPlans.filter((plan) => plan.active)} catalogue={catalogue} />
  );
}
