import Link from "next/link";
import { SkuLifecycle } from "@/components/portal/sku-lifecycle";
import { SkuWizard } from "@/components/portal/sku-wizard";
import { requirePrivilege } from "@/lib/portal/guard";
import { getSimSku } from "@/lib/portal/skus";
import { notFound } from "next/navigation";

export default async function EditSkuPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  await requirePrivilege("platform.catalogue");
  const { id } = await Promise.resolve(params);
  const sku = await getSimSku(id);
  if (!sku) notFound();

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/catalogue" className="text-sm text-quiet hover:text-accent">
            ← Catalogue
          </Link>
          <p className={`mt-3 text-sm ${sku.active ? "text-ok" : "text-danger"}`}>
            {sku.active ? "Active" : "Deactivated"}
          </p>
        </div>
        <SkuLifecycle skuId={sku.id} name={sku.name} active={sku.active} orderCount={sku.orderCount} />
      </div>
      <div className="mt-4">
        <SkuWizard sku={sku} />
      </div>
    </div>
  );
}
