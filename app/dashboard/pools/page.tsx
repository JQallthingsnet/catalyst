import { PoolsDashboard } from "@/components/portal/pools-dashboard";
import { requirePrivilege } from "@/lib/portal/guard";
import { resolvePoolCustomerScope } from "@/lib/portal/pool-scope";
import {
  listPoolModemLatest,
  listPoolRatePlanLatest,
  snapshotPoolCustomerDailyIfNeeded,
  toPoolEntityFromModem,
  toPoolEntityFromRatePlan,
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

  const rows = platformView
    ? (await listPoolRatePlanLatest({ q: params.q ?? "" })).map(toPoolEntityFromRatePlan)
    : (
        await listPoolModemLatest({
          q: params.q ?? "",
          exactCustomer: scope.exactCustomer,
        })
      ).map(toPoolEntityFromModem);

  return (
    <PoolsDashboard
      initialRows={rows}
      canEdit={can(ctx.role, "pool.create")}
      scopedCustomer={platformView ? null : scope.exactCustomer || null}
      platformView={platformView}
      groupBy={platformView ? "rate_plan" : "modem"}
    />
  );
}
