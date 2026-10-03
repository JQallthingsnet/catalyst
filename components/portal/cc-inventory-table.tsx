import { formatIccid } from "@/lib/portal/ids";
import { formatAuDateTime } from "@/lib/portal/time";
import type { CcDevice } from "@/lib/cc/devices";

function Cell({ value, mono = false }: { value: string; mono?: boolean }) {
  return <span className={mono ? "font-mono" : undefined}>{value || "—"}</span>;
}

function DateCell({ value }: { value: string | null }) {
  return <td className="whitespace-nowrap px-3 py-2.5 text-xs">{formatAuDateTime(value)}</td>;
}

export function CcInventoryTable({
  devices,
  empty = "No devices in the Control Center copy yet.",
}: {
  devices: CcDevice[];
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-panel">
      <table className="w-full min-w-300 text-left text-sm">
        <thead className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-quiet">
          <tr className="border-b border-line">
            <th className="px-3 py-2.5">ICCID</th>
            <th className="px-3 py-2.5">Added</th>
            <th className="px-3 py-2.5">Activated</th>
            <th className="px-3 py-2.5">Updated</th>
            <th className="px-3 py-2.5">Shipped</th>
            <th className="px-3 py-2.5">IMEI</th>
            <th className="px-3 py-2.5">IMSI</th>
            <th className="px-3 py-2.5">MSISDN</th>
            <th className="px-3 py-2.5">SIM status</th>
            <th className="px-3 py-2.5">Rate plan</th>
            <th className="px-3 py-2.5">Communication plan</th>
            <th className="px-3 py-2.5">Customer</th>
            <th className="px-3 py-2.5">Account ID</th>
            <th className="px-3 py-2.5">Device ID</th>
            <th className="px-3 py-2.5">Modem ID</th>
            <th className="px-3 py-2.5">Fixed IP</th>
            <th className="px-3 py-2.5">Cycle to date (MB)</th>
            <th className="px-3 py-2.5">In session</th>
            <th className="px-3 py-2.5">Global SIM</th>
            <th className="px-3 py-2.5">SIM profile</th>
            <th className="px-3 py-2.5">eUICCID</th>
            <th className="px-3 py-2.5">MEC</th>
            <th className="px-3 py-2.5">SIM notes</th>
            <th className="px-3 py-2.5">Custom fields</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => {
            const custom = device.customFields
              ? Object.entries(device.customFields)
                  .map(([key, value]) => `${key}=${value}`)
                  .join(" · ")
              : "";
            return (
              <tr key={device.iccid} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono">{formatIccid(device.iccid)}</td>
                <DateCell value={device.dateAdded} />
                <DateCell value={device.dateActivated} />
                <DateCell value={device.dateUpdated} />
                <DateCell value={device.dateShipped} />
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Cell value={device.imei ?? ""} mono />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Cell value={device.imsi ?? ""} mono />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Cell value={device.msisdn ?? ""} mono />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">{device.status}</td>
                <td className="px-3 py-2.5">{device.ratePlan ?? "—"}</td>
                <td className="px-3 py-2.5">{device.communicationPlan ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <p>{device.customer ?? "—"}</p>
                  {device.endConsumerId ? (
                    <p className="mt-0.5 text-xs text-quiet">End consumer {device.endConsumerId}</p>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                  {device.accountId ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Cell value={device.deviceId ?? ""} mono />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Cell value={device.modemId ?? ""} mono />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                  {device.fixedIpAddress || device.fixedIpv6Address || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {device.ctdUsageMb != null ? device.ctdUsageMb.toLocaleString("en-AU") : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {device.inSession == null ? "—" : device.inSession ? "Yes" : "No"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">{device.globalSimType ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                  {device.simProfileId ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Cell value={device.euiccid ?? ""} mono />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">{device.mec ?? "—"}</td>
                <td className="max-w-48 px-3 py-2.5 text-xs">{device.simNotes || "—"}</td>
                <td className="max-w-64 px-3 py-2.5 text-xs text-quiet">{custom || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {devices.length === 0 ? <p className="px-4 py-8 text-sm text-quiet">{empty}</p> : null}
    </div>
  );
}
