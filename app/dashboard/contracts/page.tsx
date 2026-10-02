import Link from "next/link";
import { ContractsAdminView } from "./admin-view";
import { requirePortal, requirePrivilege } from "@/lib/portal/guard";
import { listContractBook, listPlatformPlans, listResellerContract } from "@/lib/portal/platform-plans";
import { can } from "@/lib/portal/role-model";
import { redirect } from "next/navigation";

export default async function ContractsPage() {
  const ctx = await requirePortal();
  if (!can(ctx.role, "contract.view") && !can(ctx.role, "platform.plan")) redirect("/dashboard");

  // Reseller admin (or View as reseller admin): read-only signed lines for this org.
  if (ctx.role === "reseller_admin") {
    const lines = await listResellerContract(ctx.tenantId);
    return (
      <div>
        <h1 className="text-3xl font-semibold">Contract</h1>
        <p className="mt-1 text-sm text-quiet">
          What ATN has signed with <span className="text-ink">{ctx.tenantName}</span>. Refer here for Rate Plan New
          lines before ordering or assigning SIMs. Retail pricing is managed under Plans.
        </p>

        <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
          <table className="w-full min-w-160 text-left text-sm">
            <thead className="border-b border-line text-quiet">
              <tr>
                <th className="px-4 py-3 font-medium">Rate Plan New</th>
                <th className="px-4 py-3 font-medium">Remarks</th>
                <th className="px-4 py-3 font-medium">Default for bulk</th>
                <th className="px-4 py-3 font-medium">SIMs on line</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-quiet">
                    No contracted rate plans yet. Ask ATN to bind Rate Plan New lines for your organisation.
                  </td>
                </tr>
              ) : null}
              {lines.map((line) => (
                <tr key={line.platformPlanId} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-ink">{line.ratePlanNew}</td>
                  <td className="px-4 py-3 text-quiet">{line.remarks}</td>
                  <td className="px-4 py-3">{line.isDefault ? <span className="text-ok">Default</span> : "—"}</td>
                  <td className="px-4 py-3">{line.simCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-quiet">
          To sell to end customers, copy a contracted line into a retail plan on{" "}
          <Link href="/dashboard/plans" className="text-accent">
            Plans
          </Link>
          .
        </p>
      </div>
    );
  }

  await requirePrivilege("platform.plan");
  const [book, allPlans] = await Promise.all([listContractBook(ctx.homeTenantId), listPlatformPlans()]);
  return <ContractsAdminView book={book} plans={allPlans.filter((plan) => plan.active)} />;
}
