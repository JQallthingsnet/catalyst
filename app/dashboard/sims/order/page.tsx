import Link from "next/link";
import { OrderWizard } from "@/components/portal/order-wizard";
import { requirePrivilege } from "@/lib/portal/guard";
import { listSimSkus } from "@/lib/portal/skus";

export default async function OrderSimsPage() {
  await requirePrivilege("order.create");
  const skus = await listSimSkus();
  return (
    <div>
      <Link href="/dashboard/sims" className="text-sm text-quiet hover:text-accent">
        ← Inventory
      </Link>
      <div className="mt-4">
        <OrderWizard skus={skus} />
      </div>
    </div>
  );
}
