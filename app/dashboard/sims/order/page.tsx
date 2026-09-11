import Link from "next/link";
import { OrderWizard } from "@/components/portal/order-wizard";

export default function OrderSimsPage() {
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
