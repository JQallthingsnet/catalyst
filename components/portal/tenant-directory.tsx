import { OpenTenantButton } from "@/components/portal/tenant-switcher";
import type { PlatformTenant } from "@/lib/portal/tenant";

export function TenantDirectory({
  tenants,
  currentId,
}: {
  tenants: PlatformTenant[];
  currentId: string;
}) {
  return (
    <article className="rounded-card border border-line bg-panel p-5">
      <h2 className="font-semibold">All organisations</h2>
      <p className="mt-1 text-sm text-quiet">
        Organisation totals. Estate shows every customer and SIM. Open an organisation to change it.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-quiet">
            <tr>
              <th className="pb-2 font-medium">Organisation</th>
              <th className="pb-2 font-medium">SIMs</th>
              <th className="pb-2 font-medium">Customers</th>
              <th className="pb-2 font-medium">Members</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-quiet">
                  No organisations yet.
                </td>
              </tr>
            ) : (
              tenants.map((tenant) => (
                <tr key={tenant.id} className="border-t border-line">
                  <td className="py-3">
                    <p className="text-ink">{tenant.name}</p>
                    <p className="text-xs text-quiet">{tenant.id}</p>
                  </td>
                  <td className="py-3">{tenant.simCount}</td>
                  <td className="py-3">{tenant.customerCount}</td>
                  <td className="py-3">{tenant.memberCount}</td>
                  <td className="py-3 text-right">
                    <OpenTenantButton tenantId={tenant.id} current={tenant.id === currentId} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
