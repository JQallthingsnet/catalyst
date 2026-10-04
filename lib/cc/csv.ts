import type { CcDevice } from "@/lib/cc/devices";

export const CC_IMPORT_SAMPLE_CSV = `iccid
8944200123456789012
8944200123456789013
8944200123456789014
`;

/** Extract unique ICCIDs from a CSV or plain list (one per line). Header row optional. */
export function parseIccidsFromCsv(raw: string): string[] {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cells = splitCsvLine(line);
    const first = (cells[0] ?? "").replace(/^["']|["']$/g, "").trim();
    if (i === 0 && /^iccid$/i.test(first)) continue;
    const iccid = first.replace(/\s/g, "");
    if (!/^\d{15,22}$/.test(iccid)) continue;
    if (seen.has(iccid)) continue;
    seen.add(iccid);
    out.push(iccid);
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const EXPORT_HEADERS = [
  "supplier",
  "iccid",
  "date_added",
  "date_activated",
  "date_updated",
  "date_shipped",
  "imei",
  "imsi",
  "msisdn",
  "status",
  "rate_plan",
  "communication_plan",
  "customer",
  "end_consumer_id",
  "account_id",
  "device_id",
  "modem_id",
  "fixed_ip",
  "fixed_ipv6",
  "ctd_usage_mb",
  "in_session",
  "global_sim_type",
  "sim_profile_id",
  "euiccid",
  "mec",
  "sim_notes",
  "custom_fields",
  "polled_at",
  "details_polled_at",
] as const;

export function ccDevicesToCsv(devices: CcDevice[]): string {
  const lines = [EXPORT_HEADERS.join(",")];
  for (const device of devices) {
    const custom = device.customFields
      ? Object.entries(device.customFields)
          .map(([key, value]) => `${key}=${value}`)
          .join(" · ")
      : "";
    const row = [
      device.supplier,
      device.iccid,
      device.dateAdded,
      device.dateActivated,
      device.dateUpdated,
      device.dateShipped,
      device.imei,
      device.imsi,
      device.msisdn,
      device.status,
      device.ratePlan,
      device.communicationPlan,
      device.customer,
      device.endConsumerId,
      device.accountId,
      device.deviceId,
      device.modemId,
      device.fixedIpAddress,
      device.fixedIpv6Address,
      device.ctdUsageMb,
      device.inSession == null ? "" : device.inSession ? "Yes" : "No",
      device.globalSimType,
      device.simProfileId,
      device.euiccid,
      device.mec,
      device.simNotes,
      custom,
      device.polledAt,
      device.detailsPolledAt,
    ];
    lines.push(row.map(csvEscape).join(","));
  }
  return `${lines.join("\n")}\n`;
}
