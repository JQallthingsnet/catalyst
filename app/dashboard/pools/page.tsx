import { PoolsDashboard } from "@/components/portal/pools-dashboard";
import { requirePrivilege } from "@/lib/portal/guard";
import { resolvePoolCustomerScope } from "@/lib/portal/pool-scope";
import { listPoolCustomerLatest } from "@/lib/portal/pools";
import { can } from "@/lib/portal/role-model";

export default async function PoolsPage({
  searchParams,
}: {
  searchParams?: { q?: string } | Promise<{ q?: string }>;
}) {
  const ctx = await requirePrivilege("pool.view");
  const params = await Promise.resolve(searchParams ?? {});
  const scope = await resolvePoolCustomerScope(ctx);
  const customers = await listPoolCustomerLatest({
    q: params.q ?? "",
    exactCustomer: scope.unrestricted ? undefined : scope.exactCustomer,
  });

  return (
    <PoolsDashboard
      initialCustomers={customers}
      canEdit={can(ctx.role, "pool.create")}
      scopedCustomer={scope.unrestricted ? null : scope.exactCustomer || null}
      platformView={scope.unrestricted}
    />
  );
}
