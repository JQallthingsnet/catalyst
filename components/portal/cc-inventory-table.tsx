import { formatIccid } from "@/lib/portal/ids";
import { formatAuDateTime } from "@/lib/portal/time";
import type { CcDevice } from "@/lib/cc/devices";

function Truncate({
  value,
  className = "",
  mono = false,
}: {
  value: string;
  className?: string;
  mono?: boolean;
}) {
  const text = value || "—";
  return (
    <span
      title={value || undefined}
      className={`block max-w-full truncate ${mono ? "font-mono" : ""} ${className}`.trim()}
    >
      {text}
    </span>
  );
}

function DateCell({ value }: { value: string | null }) {
  return (
    <td className="whitespace-nowrap px-3 py-2.5 text-xs">{formatAuDateTime(value)}</td>
  );
}

function TextCell({
  value,
  mono = false,
  className = "max-w-44",
}: {
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2.5 ${className}`}>
      <Truncate value={value} mono={mono} />
    </td>
  );
}

/** Long prose fields: wrap inside the cell so text is readable without clipping into the next column. */
function WrapCell({
  value,
  className = "max-w-72",
  quiet = false,
}: {
  value: string;
  className?: string;
  quiet?: boolean;
}) {
  const text = value || "—";
  return (
    <td className={`align-top px-3 py-2.5 ${className}`}>
      <span
        title={value || undefined}
        className={`block whitespace-normal wrap-break-word text-xs leading-snug ${quiet ? "text-quiet" : ""}`.trim()}
      >
        {text}
      </span>
    </td>
  );
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
      <table className="w-max min-w-full border-separate border-spacing-0 text-left text-sm">
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
            const customer =
              device.customer && device.endConsumerId
                ? `${device.customer} · End consumer ${device.endConsumerId}`
                : device.customer ?? "";
            return (
              <tr key={device.iccid} className="border-t border-line">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono">
                  {formatIccid(device.iccid)}
                </td>
                <DateCell value={device.dateAdded} />
                <DateCell value={device.dateActivated} />
                <DateCell value={device.dateUpdated} />
                <DateCell value={device.dateShipped} />
                <TextCell value={device.imei ?? ""} mono className="max-w-40" />
                <TextCell value={device.imsi ?? ""} mono className="max-w-40" />
                <TextCell value={device.msisdn ?? ""} mono className="max-w-32" />
                <td className="whitespace-nowrap px-3 py-2.5">{device.status}</td>
                <WrapCell value={device.ratePlan ?? ""} className="max-w-56" />
                <WrapCell value={device.communicationPlan ?? ""} className="max-w-72" />
                <TextCell value={customer} className="max-w-40" />
                <TextCell value={device.accountId ?? ""} mono className="max-w-32" />
                <TextCell value={device.deviceId ?? ""} mono className="max-w-32" />
                <TextCell value={device.modemId ?? ""} mono className="max-w-40" />
                <TextCell
                  value={device.fixedIpAddress || device.fixedIpv6Address || ""}
                  mono
                  className="max-w-36"
                />
                <td className="whitespace-nowrap px-3 py-2.5">
                  {device.ctdUsageMb != null ? device.ctdUsageMb.toLocaleString("en-AU") : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {device.inSession == null ? "—" : device.inSession ? "Yes" : "No"}
                </td>
                <TextCell value={device.globalSimType ?? ""} className="max-w-32" />
                <TextCell value={device.simProfileId ?? ""} mono className="max-w-32" />
                <TextCell value={device.euiccid ?? ""} mono className="max-w-40" />
                <TextCell value={device.mec ?? ""} className="max-w-24" />
                <WrapCell value={device.simNotes ?? ""} className="max-w-72" />
                <WrapCell value={custom} className="max-w-80" quiet />
              </tr>
            );
          })}
        </tbody>
      </table>
      {devices.length === 0 ? <p className="px-4 py-8 text-sm text-quiet">{empty}</p> : null}
    </div>
  );
}
