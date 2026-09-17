import Link from "next/link";
import { DeleteSkuButton } from "@/components/portal/delete-sku-button";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/catalogue" className="text-sm text-quiet hover:text-accent">
          ← Catalogue
        </Link>
        <DeleteSkuButton id={sku.id} />
      </div>
      <div className="mt-4">
        <SkuWizard sku={sku} />
      </div>
    </div>
  );
}
