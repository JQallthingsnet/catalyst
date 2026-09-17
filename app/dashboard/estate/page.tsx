import Link from "next/link";
import { OpenTenantButton } from "@/components/portal/tenant-switcher";
import { WHOLESALE_PLANS } from "@/lib/portal/catalogue";
import { requirePrivilege } from "@/lib/portal/guard";
import { formatIccid } from "@/lib/portal/ids";
import { VIEW_ROLES } from "@/lib/portal/role-model";
import { listPlatformEstate } from "@/lib/portal/tenant";

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-card border border-line bg-panel p-5">
      <p className="text-sm text-quiet">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
    </article>
  );
}

function wholesaleLabel(id: string | null) {
  if (!id) return "—";
  return WHOLESALE_PLANS.find((item) => item.id === id)?.label ?? id;
}

export default async function EstatePage({
  searchParams,
}: {
  searchParams?: { q?: string } | Promise<{ q?: string }>;
}) {
  const ctx = await requirePrivilege("platform.estate");
  const params = await Promise.resolve(searchParams ?? {});
  const query = params.q ?? "";
  const estate = await listPlatformEstate(ctx, query);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-quiet">ACMA key-information view</p>
          <h1 className="mt-1 text-3xl font-semibold">Estate</h1>
          <p className="mt-2 max-w-2xl text-sm text-quiet">
            Who each reseller sold to, on which retail plan, and which SIMs are still in their warehouse.
            Sell stock from ATN first; the reseller assigns those SIMs to a customer.
          </p>
        </div>
        <div className="flex w-full max-w-md flex-col gap-2">
          <Link
            href="/dashboard/estate/cc"
            className="rounded-card border border-line px-4 py-2.5 text-center text-sm hover:border-accent"
          >
            CC snapshot
          </Link>
          <Link
            href="/dashboard/estate/allocate"
            className="rounded-card bg-accent px-4 py-2.5 text-center text-sm font-medium text-canvas"
          >
            Sell stock to reseller
          </Link>
          <form action="/dashboard/estate">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search organisation, customer, plan, ICCID, or member"
              className="w-full rounded-card border border-line bg-panel px-4 py-2.5 text-sm text-ink outline-none placeholder:text-quiet focus:border-accent"
            />
          </form>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Organisations" value={String(estate.totals.orgs)} />
        <Kpi label="Customers" value={estate.totals.customers.toLocaleString("en-AU")} />
        <Kpi label="SIMs" value={estate.totals.sims.toLocaleString("en-AU")} />
        <Kpi label="SIMs active" value={estate.totals.active.toLocaleString("en-AU")} />
      </div>

      <div className="mt-6 space-y-4">
        {estate.tenants.length === 0 ? (
          <p className="rounded-card border border-line bg-panel px-4 py-8 text-sm text-quiet">
            No organisations match this search.
          </p>
        ) : null}
        {estate.tenants.map((tenant) => (
          <article key={tenant.id} className="rounded-card border border-line bg-panel px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <details open={Boolean(query) || estate.tenants.length <= 3} className="min-w-0 flex-1">
                <summary className="cursor-pointer list-none">
                  <p className="text-lg font-semibold">{tenant.name}</p>
                  <p className="mt-1 text-sm text-quiet">
                    {tenant.customerCount} customers · {tenant.simCount} SIMs · {tenant.activeCount} active ·{" "}
                    {tenant.warehouse.count} in warehouse
                  </p>
                </summary>

                {tenant.warehouse.count > 0 ? (
                  <p className="mt-4 rounded-xl border border-line px-3 py-2 text-sm text-quiet">
                    Warehouse: {tenant.warehouse.count} SIMs not yet sold to a customer
                    {tenant.warehouse.plans.length > 0
                      ? ` · ${tenant.warehouse.plans.map((item) => `${item.count} ${item.plan}`).join(", ")}`
                      : ""}
                  </p>
                ) : (
                  <p className="mt-4 text-sm text-quiet">No warehouse stock. Sell SIMs to this reseller to replenish.</p>
                )}

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <section>
                    <h2 className="text-sm font-semibold">Customers and what they were sold</h2>
                    <ul className="mt-2 space-y-2 text-sm">
                      {tenant.customers.length === 0 ? <li className="text-quiet">No customers yet.</li> : null}
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
                            ATN plan:{" "}
                            {customer.wholesalePlans.length > 0 ? customer.wholesalePlans.join(", ") : "—"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h2 className="text-sm font-semibold">Members</h2>
                    <ul className="mt-2 space-y-2 text-sm">
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

                <div className="mt-4 overflow-x-auto rounded-xl border border-line">
                  <table className="w-full min-w-180 text-left text-sm">
                    <thead className="text-quiet">
                      <tr>
                        <th className="px-3 py-2">ICCID</th>
                        <th className="px-3 py-2">Customer</th>
                        <th className="px-3 py-2">Retail plan</th>
                        <th className="px-3 py-2">ATN plan</th>
                        <th className="px-3 py-2">CC rate plan</th>
                        <th className="px-3 py-2">CC status</th>
                        <th className="px-3 py-2">Pool</th>
                        <th className="px-3 py-2">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenant.sims.map((sim) => (
                        <tr key={sim.id} className="border-t border-line">
                          <td className="px-3 py-2 font-mono">{formatIccid(sim.iccid)}</td>
                          <td className="px-3 py-2">{sim.customerName ?? "Warehouse"}</td>
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
              </details>
              <div className="flex flex-col items-end gap-2">
                <OpenTenantButton tenantId={tenant.id} current={tenant.id === ctx.tenantId} />
                <Link href="/dashboard/estate/allocate" className="text-sm text-accent">
                  Sell stock
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
