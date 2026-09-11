import Link from "next/link";
import { AllocateWizard } from "@/components/portal/allocate-wizard";
import { requirePrivilege } from "@/lib/portal/guard";
import { listTenantOptions } from "@/lib/portal/tenant";

export default async function AllocateStockPage() {
  await requirePrivilege("wholesale.allocate");
  const resellers = await listTenantOptions();

  return (
    <div>
      <Link href="/dashboard/estate" className="text-sm text-quiet hover:text-accent">
        ← Estate
      </Link>
      <div className="mt-4">
        <AllocateWizard resellers={resellers} />
      </div>
    </div>
  );
}
