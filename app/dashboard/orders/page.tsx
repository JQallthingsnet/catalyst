import Link from "next/link";
import { requirePrivilege } from "@/lib/portal/guard";
import { listOrders } from "@/lib/portal/repo";

export default async function OrdersPage() {
  const ctx = await requirePrivilege("order.create");
  const orders = await listOrders(ctx.tenantId);

  return (
    <div>
      <div className="flex items-end justify-between">
        <h1 className="text-3xl font-semibold">Orders</h1>
        <Link href="/dashboard/sims/order" className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-canvas">
          Order SIMs
        </Link>
      </div>
      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full text-left text-sm">
          <thead className="text-quiet">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Logistics</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-line">
                <td className="px-4 py-3 font-mono text-xs">{order.id.slice(-8)}</td>
                <td className="px-4 py-3">{order.skuName}</td>
                <td className="px-4 py-3">{order.quantity}</td>
                <td className="px-4 py-3">{order.destination ?? order.logistics}</td>
                <td className="px-4 py-3">{order.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
