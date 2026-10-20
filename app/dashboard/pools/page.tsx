import { PoolsDashboard } from "@/components/portal/pools-dashboard";
import { requirePrivilege } from "@/lib/portal/guard";
import { resolvePoolCustomerScope } from "@/lib/portal/pool-scope";
import {
  listPoolModemLatest,
  snapshotPoolCustomerDailyIfNeeded,
  toPoolEntityFromModem,
} from "@/lib/portal/pools";
import { can } from "@/lib/portal/role-model";

export default async function PoolsPage({
  searchParams,
}: {
  searchParams?: { q?: string } | Promise<{ q?: string }>;
}) {
  const ctx = await requirePrivilege("pool.view");
  const params = await Promise.resolve(searchParams ?? {});
  const scope = await resolvePoolCustomerScope(ctx);
  const platformView = scope.unrestricted;
  // One point per Sydney calendar day; first visit/cron after midnight creates today's row.
  await snapshotPoolCustomerDailyIfNeeded();

  // Always group by modem_ID (platform = all customers; reseller = bound CC customer).
  const rows = (
    await listPoolModemLatest({
      q: params.q ?? "",
      exactCustomer: platformView ? undefined : scope.exactCustomer,
    })
  ).map(toPoolEntityFromModem);

  return (
    <PoolsDashboard
      initialRows={rows}
      canEdit={can(ctx.role, "pool.create")}
      scopedCustomer={platformView ? null : scope.exactCustomer || null}
      platformView={platformView}
      groupBy="modem"
    />
  );
}
