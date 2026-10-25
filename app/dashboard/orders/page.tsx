import Link from "next/link";
import { AdvanceOrderButton } from "@/components/portal/advance-order-button";
import { RevokeOrderButton } from "@/components/portal/revoke-order-button";
import { nextOrderSimsStatus } from "@/lib/portal/catalogue";
import { requirePrivilege } from "@/lib/portal/guard";
import {
  listOrderFilterOptions,
  listOrders,
  normalizeOrderFilter,
  orderFilterActive,
  orderKindLabel,
} from "@/lib/portal/repo";
import { btnPrimary, btnSecondary } from "@/lib/portal/button-styles";
import { formatAuDateTime } from "@/lib/portal/time";

function FilterSelect({
  name,
  label,
  value,
  options,
  allLabel,
}: {
  name: string;
  label: string;
  value: string;
  options: Array<string | { value: string; label: string }>;
  allLabel: string;
}) {
  return (
    <label className="block text-xs font-medium text-quiet">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="mt-1 h-10 w-full truncate rounded-full border border-line bg-panel px-3 text-sm text-ink"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?:
    | {
        q?: string;
        org?: string;
        status?: string;
        kind?: string;
        sku?: string;
        dateFrom?: string;
        dateTo?: string;
      }
    | Promise<{
        q?: string;
        org?: string;
        status?: string;
        kind?: string;
        sku?: string;
        dateFrom?: string;
        dateTo?: string;
      }>;
}) {
  const ctx = await requirePrivilege("order.create");
  const asPlatform =
    ctx.role === "super_admin" && ctx.isSuperAdmin && ctx.tenantId === ctx.homeTenantId;
  const params = await Promise.resolve(searchParams ?? {});
  const filter = normalizeOrderFilter({
    scopeTenantId: asPlatform ? undefined : ctx.tenantId,
    excludeTenantId: asPlatform ? ctx.homeTenantId : undefined,
    organisationId: asPlatform ? params.org : undefined,
    query: params.q,
    status: params.status,
    kind: params.kind,
    skuName: params.sku,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  const filtered = orderFilterActive(filter);
  const [orders, options] = await Promise.all([
    listOrders(filter),
    listOrderFilterOptions({
      scopeTenantId: filter.scopeTenantId,
      excludeTenantId: filter.excludeTenantId,
    }),
  ]);
  const clearHref = "/dashboard/orders";
  const colCount = asPlatform ? 11 : 10;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Orders</h1>
          <p className="mt-1 text-sm text-quiet">
            {asPlatform
              ? "Reseller Order SIMs (Accept → Ship → Receive for plastic or eSIM) and ATN Sell stock into warehouses."
              : "Your organisation’s SIM orders. Submitted orders can be revoked until ATN accepts."}
          </p>
        </div>
        {asPlatform ? (
          <Link href="/dashboard/estate/allocate" className={btnPrimary}>
            Sell stock
          </Link>
        ) : (
          <Link href="/dashboard/sims/order" className={btnPrimary}>
            Order SIMs
          </Link>
        )}
      </div>

      <form
        action="/dashboard/orders"
        className="mt-6 w-full space-y-4 rounded-card border border-line bg-panel p-4"
      >
        <label className="block text-xs font-medium text-quiet">
          Search
          <input
            name="q"
            defaultValue={filter.query ?? ""}
            placeholder={
              asPlatform
                ? "Order id, SKU, PO, logistics, organisation, created by…"
                : "Order id, SKU, PO, logistics, created by…"
            }
            className="mt-1 h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm text-ink"
          />
        </label>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
          <label className="block text-xs font-medium text-quiet">
            From
            <input
              type="date"
              name="dateFrom"
              defaultValue={filter.dateFrom ?? ""}
              className="mt-1 h-10 w-full rounded-full border border-line bg-panel px-3 text-sm text-ink"
            />
          </label>
          <label className="block text-xs font-medium text-quiet">
            To
            <input
              type="date"
              name="dateTo"
              defaultValue={filter.dateTo ?? ""}
              className="mt-1 h-10 w-full rounded-full border border-line bg-panel px-3 text-sm text-ink"
            />
          </label>
          {asPlatform ? (
            <FilterSelect
              name="org"
              label="Organisation"
              value={filter.organisationId ?? ""}
              allLabel="All organisations"
              options={options.organisations.map((org) => ({ value: org.id, label: org.name }))}
            />
          ) : null}
          <FilterSelect
            name="kind"
            label="Type"
            value={filter.kind ?? ""}
            allLabel="All types"
            options={options.kinds.map((kind) => ({
              value: kind,
              label: orderKindLabel(kind),
            }))}
          />
          <FilterSelect
            name="status"
            label="Status"
            value={filter.status ?? ""}
            allLabel="All statuses"
            options={options.statuses}
          />
          <FilterSelect
            name="sku"
            label="SKU"
            value={filter.skuName ?? ""}
            allLabel="All SKUs"
            options={options.skuNames}
          />
        </div>
        <p className="text-xs text-quiet">Dates use Australia/Sydney calendar days. Leave empty to ignore.</p>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={btnPrimary}>
            Apply filters
          </button>
          {filtered ? (
            <Link href={clearHref} className={btnSecondary}>
              Clear
            </Link>
          ) : null}
          <span className="text-xs text-quiet">
            {orders.length.toLocaleString("en-AU")} order{orders.length === 1 ? "" : "s"}
            {filtered ? " matching" : ""}
          </span>
        </div>
      </form>

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full text-left text-sm">
          <thead className="text-quiet">
            <tr>
              {asPlatform ? <th className="px-4 py-3">Organisation</th> : null}
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">PO</th>
              <th className="px-4 py-3">Logistics</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3"> </th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr className="border-t border-line">
                <td colSpan={colCount} className="px-4 py-6 text-sm text-quiet">
                  {filtered
                    ? "No orders match these filters."
                    : asPlatform
                      ? "No reseller orders yet. Sell stock or wait for a reseller to Order SIMs."
                      : "No orders yet."}
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const isOrderSims = order.kind === "order_sims";
                const isSubmitted = order.status === "Submitted" || order.status === "Draft";
                const isSuper = ctx.isSuperAdmin && ctx.role === "super_admin";
                const canRevoke = isOrderSims && isSubmitted;
                const canCancelPastSubmitted = isOrderSims && !isSubmitted && isSuper;
                const nextStatus = isOrderSims && isSuper ? nextOrderSimsStatus(order.status) : null;
                return (
                  <tr key={order.id} className="border-t border-line">
                    {asPlatform ? (
                      <td className="px-4 py-3">{order.tenantName ?? "—"}</td>
                    ) : null}
                    <td className="px-4 py-3">{orderKindLabel(order.kind)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{order.id.slice(-8)}</td>
                    <td className="px-4 py-3">{order.skuName}</td>
                    <td className="px-4 py-3">{order.quantity.toLocaleString("en-AU")}</td>
                    <td className="px-4 py-3">{order.poNumber ?? "—"}</td>
                    <td className="px-4 py-3">{order.destination ?? order.logistics}</td>
                    <td className="px-4 py-3">{order.status}</td>
                    <td className="px-4 py-3 text-quiet">{order.createdBy ?? "—"}</td>
                    <td className="px-4 py-3 text-quiet">{formatAuDateTime(order.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {nextStatus ? (
                          <AdvanceOrderButton
                            orderId={order.id}
                            skuName={order.skuName}
                            quantity={order.quantity}
                            nextStatus={nextStatus}
                          />
                        ) : null}
                        {canRevoke ? (
                          <RevokeOrderButton
                            orderId={order.id}
                            skuName={order.skuName}
                            quantity={order.quantity}
                            status={order.status}
                            mode="revoke"
                          />
                        ) : null}
                        {canCancelPastSubmitted ? (
                          <RevokeOrderButton
                            orderId={order.id}
                            skuName={order.skuName}
                            quantity={order.quantity}
                            status={order.status}
                            mode="cancel"
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
