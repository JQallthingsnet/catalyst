import Link from "next/link";
import { btnPrimary, btnSecondary } from "@/lib/portal/button-styles";
import { requirePrivilege } from "@/lib/portal/guard";
import { listPlatformEstateIndex } from "@/lib/portal/tenant";

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-card border border-line bg-panel p-5">
      <p className="text-sm text-quiet">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
    </article>
  );
}

export default async function EstatePage({
  searchParams,
}: {
  searchParams?: { q?: string } | Promise<{ q?: string }>;
}) {
  const ctx = await requirePrivilege("platform.estate");
  const params = await Promise.resolve(searchParams ?? {});
  const query = params.q ?? "";
  const estate = await listPlatformEstateIndex(ctx, query);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <p className="text-sm text-quiet">ACMA key-information view</p>
          <h1 className="mt-1 text-3xl font-semibold">Estate</h1>
          <p className="mt-2 text-sm text-quiet">
            Bird’s-eye of reseller organisations — bound Control Center customer, SIM counts, and members.
            Open an organisation for customers, ICCIDs, and detail.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/estate/cc" className={btnSecondary}>
            CC snapshot
          </Link>
          <Link href="/dashboard/estate/allocate" className={btnPrimary}>
            Sell stock
          </Link>
        </div>
      </div>

      <form action="/dashboard/estate" className="mt-5">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search organisation, CC customer, member, or ICCID"
          className="h-10 w-full max-w-md rounded-full border border-line bg-panel px-4 text-sm text-ink outline-none placeholder:text-quiet focus:border-accent"
        />
      </form>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Organisations" value={String(estate.totals.orgs)} />
        <Kpi label="Customers" value={estate.totals.customers.toLocaleString("en-AU")} />
        <Kpi label="SIMs" value={estate.totals.sims.toLocaleString("en-AU")} />
        <Kpi label="SIMs active" value={estate.totals.active.toLocaleString("en-AU")} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-200 text-left text-sm">
          <thead className="border-b border-line text-quiet">
            <tr>
              <th className="px-4 py-3 font-medium">Organisation</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Bound CC customer</th>
              <th className="px-4 py-3 font-medium">End customers</th>
              <th className="px-4 py-3 font-medium">SIMs</th>
              <th className="px-4 py-3 font-medium">SIMs active</th>
              <th className="px-4 py-3 font-medium">Members</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {estate.tenants.map((tenant) => (
              <tr key={tenant.id} className="border-t border-line align-middle">
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/estate/${tenant.id}`}
                    className="font-medium text-ink hover:text-accent"
                  >
                    {tenant.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={tenant.active ? "text-ok" : "text-danger"}>
                    {tenant.active ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td className="max-w-56 px-4 py-3">
                  {tenant.ccCustomer ? (
                    <span className="wrap-break-word" title={tenant.ccCustomer}>
                      {tenant.ccCustomer}
                    </span>
                  ) : (
                    <span className="text-quiet">Not bound</span>
                  )}
                </td>
                <td className="px-4 py-3">{tenant.customerCount.toLocaleString("en-AU")}</td>
                <td className="px-4 py-3">{tenant.simCount.toLocaleString("en-AU")}</td>
                <td className="px-4 py-3">{tenant.activeSimCount.toLocaleString("en-AU")}</td>
                <td className="px-4 py-3">{tenant.memberCount.toLocaleString("en-AU")}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/dashboard/estate/${tenant.id}`} className="text-accent">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {estate.tenants.length === 0 ? (
          <p className="px-4 py-8 text-sm text-quiet">
            {query.trim()
              ? "No organisations match this search."
              : "No reseller organisations yet. Create one from Admin, then Sell stock to bind a CC customer."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
