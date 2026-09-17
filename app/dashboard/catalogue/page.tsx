import Link from "next/link";
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
            SIM products ATN sells. Super admin creates and edits these. Sell stock and Order SIMs use this list — not
            dummy SKUs.
          </p>
        </div>
        <Link
          href="/dashboard/catalogue/new"
          className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-medium text-canvas"
        >
          Create SKU
        </Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {skus.length === 0 ? (
          <p className="text-sm text-quiet">No SKUs yet. Create the nano / MFF2 / eSIM products you actually sell.</p>
        ) : null}
        {skus.map((sku) => (
          <Link
            key={sku.id}
            href={`/dashboard/catalogue/${sku.id}`}
            className="rounded-card border border-line bg-panel p-5 hover:border-accent"
          >
            <p className="text-lg font-semibold">{sku.name}</p>
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
