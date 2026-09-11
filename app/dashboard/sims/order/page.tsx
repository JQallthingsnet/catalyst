import Link from "next/link";
import { OrderWizard } from "@/components/portal/order-wizard";
import { requirePrivilege } from "@/lib/portal/guard";

export default async function OrderSimsPage() {
  await requirePrivilege("order.create");
  return (
    <div>
      <Link href="/dashboard/sims" className="text-sm text-quiet hover:text-accent">
        ← Inventory
      </Link>
      <div className="mt-4">
        <OrderWizard />
      </div>
    </div>
  );
}
