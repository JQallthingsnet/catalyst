import Link from "next/link";
import { OrderWizard } from "@/components/portal/order-wizard";
import { requirePrivilege } from "@/lib/portal/guard";
import { listResellerSkus, listSimSkus } from "@/lib/portal/skus";

export default async function OrderSimsPage() {
  const ctx = await requirePrivilege("order.create");
  const skus =
    ctx.role === "super_admin"
      ? await listSimSkus({ activeOnly: true })
      : (await listResellerSkus(ctx.tenantId))
          .filter((sku) => sku.active)
          .map((sku) => ({
            id: sku.skuId,
            name: sku.name,
            formFactor: sku.formFactor,
            tech: sku.tech,
            region: sku.region,
            blurb: "",
            createdAt: "",
            active: true,
            orderCount: 0,
          }));

  return (
    <div>
      <Link href="/dashboard/sims" className="text-sm text-quiet hover:text-accent">
        ← Inventory
      </Link>
      {skus.length === 0 && ctx.role !== "super_admin" ? (
        <p className="mt-4 text-sm text-danger">
          No catalogue products on your contract yet. Ask ATN to bind SKUs on Contract before you can order.
        </p>
      ) : null}
      <div className="mt-4">
        <OrderWizard skus={skus} />
      </div>
    </div>
  );
}
