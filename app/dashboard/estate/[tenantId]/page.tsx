import Link from "next/link";
import { notFound } from "next/navigation";
import { OpenTenantButton } from "@/components/portal/tenant-switcher";
import { btnPrimary, btnSecondary } from "@/lib/portal/button-styles";
import { requirePrivilege } from "@/lib/portal/guard";
import { VIEW_ROLES } from "@/lib/portal/role-model";
import { getPlatformEstateTenant, loadTenant } from "@/lib/portal/tenant";

function wholesaleLabel(id: string | null) {
  if (!id) return "—";
  return id;
}

export default async function EstateTenantPage({
  params,
}: {
  params: { tenantId: string } | Promise<{ tenantId: string }>;
}) {
  const ctx = await requirePrivilege("platform.estate");
  const { tenantId } = await Promise.resolve(params);
  const [tenant, record] = await Promise.all([
    getPlatformEstateTenant(ctx, tenantId),
    loadTenant(tenantId),
  ]);
  if (!tenant || !record) notFound();

  return (
    <div>
      <Link href="/dashboard/estate" className="text-sm text-quiet hover:text-accent">
        ← Estate
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-3xl font-semibold">{tenant.name}</h1>
          <p className="mt-2 text-sm text-quiet">
            {tenant.customerCount} end customers · {tenant.simCount} SIMs · {tenant.activeCount} active
            {record.ccCustomer ? (
              <>
                {" · "}
                Bound CC customer <span className="text-ink">{record.ccCustomer}</span>
              </>
            ) : (
              " · CC customer not bound yet"
            )}
          </p>
          {!record.active ? <p className="mt-2 text-sm text-danger">Organisation deactivated</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OpenTenantButton tenantId={tenant.id} current={tenant.id === ctx.tenantId} />
          <Link href="/dashboard/estate/allocate" className={btnSecondary}>
            Sell stock
          </Link>
          <Link href="/dashboard/estate/cc" className={btnPrimary}>
            CC snapshot
          </Link>
        </div>
      </div>

      {tenant.warehouse.count > 0 ? (
        <p className="mt-4 rounded-xl border border-line bg-panel px-3 py-2 text-sm text-quiet">
          {tenant.warehouse.count.toLocaleString("en-AU")} SIM
          {tenant.warehouse.count === 1 ? "" : "s"} in Catalyst for this org, not yet assigned to an end
          customer
          {tenant.warehouse.plans.length > 0
            ? ` · ${tenant.warehouse.plans.map((item) => `${item.count} ${item.plan}`).join(", ")}`
            : ""}
        </p>
      ) : tenant.simCount === 0 ? (
        <p className="mt-4 text-sm text-quiet">
          No SIMs in Catalyst for this organisation yet. Bind a CC customer via Sell stock (after Customer is set
          in Jasper and synced).
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-panel p-5">
          <h2 className="text-sm font-semibold">End customers</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {tenant.customers.length === 0 ? <li className="text-quiet">No end customers yet.</li> : null}
            {tenant.customers.map((customer) => (
              <li key={customer.id} className="rounded-xl border border-line px-3 py-2">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{customer.name}</span>
                  <span className="text-quiet">
                    {customer.simCount} SIMs · {customer.activeCount} active
                  </span>
                </div>
                <p className="mt-1 text-quiet">
                  Retail: {customer.plansSold.length > 0 ? customer.plansSold.join(", ") : "—"}
                </p>
                <p className="text-quiet">
                  Reseller Plan:{" "}
                  {customer.wholesalePlans.length > 0 ? customer.wholesalePlans.join(", ") : "—"}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-card border border-line bg-panel p-5">
          <h2 className="text-sm font-semibold">Members</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {tenant.members.length === 0 ? <li className="text-quiet">No members.</li> : null}
            {tenant.members.map((member) => (
              <li key={member.email} className="flex justify-between rounded-xl border border-line px-3 py-2">
                <span>{member.email}</span>
                <span className="text-quiet">
                  {VIEW_ROLES.find((item) => item.id === member.role)?.label ?? member.role}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="border-b border-line text-quiet">
            <tr>
              <th className="px-3 py-2">ICCID</th>
              <th className="px-3 py-2">End customer</th>
              <th className="px-3 py-2">Retail plan</th>
              <th className="px-3 py-2">Reseller Plan</th>
              <th className="px-3 py-2">Supplier code</th>
              <th className="px-3 py-2">CC status</th>
              <th className="px-3 py-2">Pool</th>
              <th className="px-3 py-2">State</th>
            </tr>
          </thead>
          <tbody>
            {tenant.sims.map((sim) => (
              <tr key={sim.id} className="border-t border-line">
                <td className="whitespace-nowrap px-3 py-2 font-mono">{sim.iccid}</td>
                <td className="px-3 py-2">{sim.customerName ?? "—"}</td>
                <td className="px-3 py-2">{sim.planName ?? "—"}</td>
                <td className="px-3 py-2">{sim.platformPlanName ?? "—"}</td>
                <td className="px-3 py-2">{wholesaleLabel(sim.wholesalePlan)}</td>
                <td className="px-3 py-2">{sim.ccStatus ?? "—"}</td>
                <td className="px-3 py-2">{sim.poolName ?? "—"}</td>
                <td className="px-3 py-2">{sim.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tenant.sims.length === 0 ? <p className="px-3 py-6 text-sm text-quiet">No SIMs.</p> : null}
      </div>
    </div>
  );
}
