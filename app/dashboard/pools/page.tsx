import { PoolsDashboard } from "@/components/portal/pools-dashboard";
import { requirePrivilege } from "@/lib/portal/guard";
import { resolvePoolCustomerScope } from "@/lib/portal/pool-scope";
import { listPoolCustomerLatest, snapshotPoolCustomerDailyIfNeeded } from "@/lib/portal/pools";
import { can } from "@/lib/portal/role-model";
import type { UsageAllowanceBasis } from "@/lib/portal/sim-usage";

export default async function PoolsPage({
  searchParams,
}: {
  searchParams?: { q?: string } | Promise<{ q?: string }>;
}) {
  const ctx = await requirePrivilege("pool.view");
  const params = await Promise.resolve(searchParams ?? {});
  const scope = await resolvePoolCustomerScope(ctx);
  const basis: UsageAllowanceBasis = scope.unrestricted ? "rate_plan" : "modem";
  // One point per Sydney calendar day; first visit/cron after midnight creates today's row.
  await snapshotPoolCustomerDailyIfNeeded();
  const customers = scope.unrestricted
    ? await listPoolCustomerLatest({ q: params.q ?? "", basis })
    : await listPoolCustomerLatest({
        q: params.q ?? "",
        exactCustomer: scope.exactCustomer,
        basis,
      });

  return (
    <PoolsDashboard
      initialCustomers={customers}
      canEdit={can(ctx.role, "pool.create")}
      scopedCustomer={scope.unrestricted ? null : scope.exactCustomer || null}
      platformView={scope.unrestricted}
      basis={basis}
    />
  );
}
