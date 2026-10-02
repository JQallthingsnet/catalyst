import Link from "next/link";
import { NameForm } from "@/components/portal/name-form";
import { requirePortal } from "@/lib/portal/guard";
import { listCustomers } from "@/lib/portal/repo";
import { can } from "@/lib/portal/role-model";

export default async function CustomersPage() {
  const ctx = await requirePortal();
  const onPlatform = ctx.isSuperAdmin && ctx.tenantId === ctx.homeTenantId;

  if (onPlatform) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Customers</h1>
        <p className="mt-1 text-sm text-quiet">
          End customers belong to reseller organisations. ATN Platform does not hold customers.
        </p>
        <p className="mt-6 rounded-card border border-line bg-panel px-4 py-5 text-sm text-quiet">
          Create a reseller from{" "}
          <Link href="/dashboard/admin" className="text-accent">
            Admin
          </Link>
          , or open{" "}
          <Link href="/dashboard/estate" className="text-accent">
            Estate
          </Link>{" "}
          after you have one. Use <span className="text-ink">View as</span> reseller admin to manage that org’s
          customers.
        </p>
      </div>
    );
  }

  const customers = await listCustomers(ctx.tenantId);

  return (
    <div>
      <h1 className="text-3xl font-semibold">Customers</h1>
      <p className="mt-1 text-sm text-quiet">End customers of this reseller. Isolated by tenant.</p>
      {can(ctx.role, "customer.create") ? (
        <div className="mt-6 rounded-card border border-line bg-panel p-5">
          <NameForm kind="customer" placeholder="Customer name" button="Add customer" />
        </div>
      ) : null}
      <ul className="mt-4 space-y-2">
        {customers.length === 0 ? (
          <li className="rounded-card border border-line bg-panel px-4 py-3 text-sm text-quiet">No customers yet.</li>
        ) : null}
        {customers.map((customer) => (
          <li key={customer.id} className="flex items-center justify-between rounded-card border border-line bg-panel px-4 py-3">
            <span>{customer.name}</span>
            {can(ctx.role, "assign") ? (
              <Link href="/dashboard/sims/assign" className="text-sm text-accent">
                Assign SIMs
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
