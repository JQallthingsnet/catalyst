import { PoolsDashboard } from "@/components/portal/pools-dashboard";
import { requirePrivilege } from "@/lib/portal/guard";
import { listPoolCustomerLatest } from "@/lib/portal/pools";
import { can } from "@/lib/portal/role-model";

export default async function PoolsPage({
  searchParams,
}: {
  searchParams?: { q?: string } | Promise<{ q?: string }>;
}) {
  const ctx = await requirePrivilege("pool.view");
  const params = await Promise.resolve(searchParams ?? {});
  const customers = await listPoolCustomerLatest(params.q ?? "");

  return (
    <PoolsDashboard
      initialCustomers={customers}
      canEdit={can(ctx.role, "pool.create")}
    />
  );
}
