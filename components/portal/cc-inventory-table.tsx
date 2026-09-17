import { formatIccid } from "@/lib/portal/ids";
import type { CcDevice } from "@/lib/cc/devices";

function formatCcDate(value: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value.replace(" ", "T"));
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-AU");
}

export function CcInventoryTable({ devices }: { devices: CcDevice[] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-panel">
      <table className="w-full min-w-180 text-left text-sm">
        <thead className="text-quiet">
          <tr>
            <th className="px-4 py-3">ICCID</th>
            <th className="px-4 py-3">IMSI</th>
            <th className="px-4 py-3">MSISDN</th>
            <th className="px-4 py-3">SIM status</th>
            <th className="px-4 py-3">Rate plan</th>
            <th className="px-4 py-3">Cycle to date (MB)</th>
            <th className="px-4 py-3">In session</th>
            <th className="px-4 py-3">Activated</th>
            <th className="px-4 py-3">Date added</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <tr key={device.iccid} className="border-t border-line">
              <td className="px-4 py-3 font-mono">{formatIccid(device.iccid)}</td>
              <td className="px-4 py-3 font-mono">{device.imsi ?? "—"}</td>
              <td className="px-4 py-3 font-mono">{device.msisdn ?? "—"}</td>
              <td className="px-4 py-3">{device.status}</td>
              <td className="px-4 py-3">{device.ratePlan ?? "—"}</td>
              <td className="px-4 py-3">{device.ctdUsageMb != null ? device.ctdUsageMb : "—"}</td>
              <td className="px-4 py-3">{device.inSession == null ? "—" : device.inSession ? "Yes" : "No"}</td>
              <td className="px-4 py-3">{formatCcDate(device.dateActivated)}</td>
              <td className="px-4 py-3">{formatCcDate(device.dateAdded)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {devices.length === 0 ? <p className="px-4 py-8 text-sm text-quiet">No devices in the Control Center copy yet.</p> : null}
    </div>
  );
}
