import { formatIccid } from "@/lib/portal/ids";
import { formatAuDateTime } from "@/lib/portal/time";
import type { CcDevice } from "@/lib/cc/devices";

function Cell({ value, mono = false }: { value: string; mono?: boolean }) {
  return <span className={mono ? "font-mono" : undefined}>{value || "—"}</span>;
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
      <table className="w-full min-w-full text-left text-sm">
        <thead className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-quiet">
          <tr className="border-b border-line">
            <th className="px-3 py-2.5">Date added</th>
            <th className="px-3 py-2.5">ICCID</th>
            <th className="px-3 py-2.5">Cycle to date (MB)</th>
            <th className="px-3 py-2.5">In session</th>
            <th className="px-3 py-2.5">Rate plan</th>
            <th className="px-3 py-2.5">Communication plan</th>
            <th className="px-3 py-2.5">MSISDN</th>
            <th className="px-3 py-2.5">IMSI</th>
            <th className="px-3 py-2.5">SIM status</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <tr key={device.iccid} className="border-t border-line align-top">
              <td className="whitespace-nowrap px-3 py-2.5">
                <p>{formatAuDateTime(device.dateAdded)}</p>
                <p className="mt-0.5 text-xs text-quiet">
                  Activated {formatAuDateTime(device.dateActivated)}
                </p>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 font-mono">{formatIccid(device.iccid)}</td>
              <td className="whitespace-nowrap px-3 py-2.5">
                {device.ctdUsageMb != null ? device.ctdUsageMb.toLocaleString("en-AU") : "—"}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                {device.inSession == null ? "—" : device.inSession ? "Yes" : "No"}
              </td>
              <td className="px-3 py-2.5">{device.ratePlan ?? "—"}</td>
              <td className="px-3 py-2.5">{device.communicationPlan ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <Cell value={device.msisdn ?? ""} mono />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <Cell value={device.imsi ?? ""} mono />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">{device.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {devices.length === 0 ? <p className="px-4 py-8 text-sm text-quiet">{empty}</p> : null}
    </div>
  );
}
