import Link from "next/link";
import { SkuWizard } from "@/components/portal/sku-wizard";
import { requirePrivilege } from "@/lib/portal/guard";

export default async function NewSkuPage() {
  await requirePrivilege("platform.catalogue");
  return (
    <div>
      <Link href="/dashboard/catalogue" className="text-sm text-quiet hover:text-accent">
        ← Catalogue
      </Link>
      <div className="mt-4">
        <SkuWizard />
      </div>
    </div>
  );
}
