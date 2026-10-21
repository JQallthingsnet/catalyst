import Link from "next/link";
import { btnPrimary } from "@/lib/portal/button-styles";
import { requirePrivilege } from "@/lib/portal/guard";
import { listSimSkus } from "@/lib/portal/skus";

export default async function CataloguePage() {
  await requirePrivilege("platform.catalogue");
  const skus = await listSimSkus();

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-3xl font-semibold">Catalogue</h1>
          <p className="mt-2 text-sm text-quiet">
            SIM types ATN sells, e.g.: eSIM, Nano, MFF2 Industrial etc. Create, edit, deactivate, or delete SIM type
            here. Sell stock and Order SIMs only use active items.
          </p>
        </div>
        <Link href="/dashboard/catalogue/new" className={btnPrimary}>
          Create SIM type
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(16rem,20rem))] gap-4">
        {skus.length === 0 ? (
          <p className="text-sm text-quiet">No SIM types yet. Create eSIM, Nano, MFF2 Industrial, etc.</p>
        ) : null}
        {skus.map((sku) => (
          <Link
            key={sku.id}
            href={`/dashboard/catalogue/${sku.id}`}
            className={`rounded-card border bg-panel p-5 hover:border-accent ${
              sku.active ? "border-line" : "border-line opacity-70"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-lg font-semibold">{sku.name}</p>
              <span className={`shrink-0 text-xs ${sku.active ? "text-ok" : "text-danger"}`}>
                {sku.active ? "Active" : "Deactivated"}
              </span>
            </div>
            <p className="mt-1 text-sm text-quiet">
              {sku.formFactor} · {sku.tech} · {sku.region}
            </p>
            {sku.blurb ? <p className="mt-3 text-sm text-quiet">{sku.blurb}</p> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
