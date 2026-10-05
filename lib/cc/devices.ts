import { getDB, isCcAutoPollEnabled } from "@/lib/env";
import {
  beginJasperBudget,
  CcBudgetError,
  CcBusyError,
  CcRateLimitError,
  fetchJasperBulkDevices,
  fetchJasperCtdUsage,
  fetchJasperDeviceDetails,
  fetchJasperDevicesPage,
  fetchJasperSessionInfo,
  JASPER_BULK_DEVICE_LIMIT,
  jasperConfigured,
  jasperHasBudget,
  type JasperDevice,
} from "@/lib/cc/client";
import { type SimState } from "@/lib/portal/catalogue";
import { DEFAULT_PLAN_SUPPLIER, normalizePlanSupplier } from "@/lib/portal/plan-suppliers";
import { ccDevicesToCsv } from "@/lib/cc/csv";
import { parseYmd, sydneyDayEndExclusiveIso, sydneyDayStartIso } from "@/lib/portal/time";

const SYNC_ID = "devices";
/** Manual Sync while auto poll is off — keep the click short. */
const MANUAL_PAGES_PER_RUN = 20;
const MANUAL_DETAILS_PER_RUN = 8;
const MANUAL_BUDGET_MS = 25_000;
/** Auto poll continues on the next cron; stay under the Worker subrequest cap. */
const AUTO_BUDGET_MS = 12 * 60 * 1000;
const JASPER_CALLS_MANUAL = 16;
const JASPER_CALLS_AUTO = 80;
const DETAILS_STALE_MS = 15 * 60 * 1000;
/** Hold the D1 lock for the whole auto-poll budget so Sync/cron cannot steal it mid-run. */
const LOCK_MS = AUTO_BUDGET_MS + 60_000;

/** null = not tried this sync run; false = fall back to per-ICCID details. */
let bulkDetailsAvailable: boolean | null = null;

export type CcDevice = {
  iccid: string;
  supplier: string;
  status: string;
  ratePlan: string | null;
  communicationPlan: string | null;
  imsi: string | null;
  msisdn: string | null;
  imei: string | null;
  customer: string | null;
  endConsumerId: string | null;
  ctdUsageMb: number | null;
  inSession: boolean | null;
  dateAdded: string | null;
  dateActivated: string | null;
  dateUpdated: string | null;
  dateShipped: string | null;
  accountId: string | null;
  fixedIpAddress: string | null;
  fixedIpv6Address: string | null;
  simNotes: string | null;
  deviceId: string | null;
  modemId: string | null;
  globalSimType: string | null;
  mec: string | null;
  euiccid: string | null;
  simProfileId: string | null;
  customFields: Record<string, string> | null;
  polledAt: string;
  detailsPolledAt: string | null;
};

export type CcSyncState = {
  modifiedSince: string | null;
  nextPage: number;
  lockedUntil: string | null;
  lastPolledAt: string | null;
  lastError: string | null;
  lastTotal: number | null;
  lastPage: number | null;
  lastPageComplete: boolean;
  autoPoll: boolean;
  configured: boolean;
};

export type CcSyncResult = {
  pages: number;
  upserted: number;
  details: number;
  lastPage: boolean;
  totalCount: number;
  nextPage: number;
};

function isoNow(): string {
  return new Date().toISOString();
}

function defaultModifiedSince(): string {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 360);
  return start.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

function bytesToMb(bytes: number | undefined): number | null {
  if (bytes == null || Number.isNaN(bytes)) return null;
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function isPresent(value: string | null | undefined): boolean {
  if (value == null) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.toLowerCase() !== "null";
}

function sessionActive(started: string | null | undefined, ended: string | null | undefined): boolean {
  return isPresent(started) && !isPresent(ended);
}

export function mapCcStatus(status: string): SimState | null {
  const value = status.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (value === "ACTIVATED" || value === "ACTIVE") return "Active";
  if (value === "SUSPENDED") return "Suspended";
  if (value === "DEACTIVATED" || value === "RETIRED" || value === "PURGED") return "Deactivated";
  if (
    value === "INVENTORY" ||
    value === "TEST_READY" ||
    value === "ACTIVATION_READY" ||
    value === "REPLACED" ||
    value === "READY"
  ) {
    return "Ready";
  }
  return null;
}

const CC_FREE_STATUSES = "('INVENTORY','TEST_READY','ACTIVATION_READY','READY')";
const CC_STATUS_KEY = `UPPER(REPLACE(REPLACE(TRIM(d.status), '-', '_'), ' ', '_'))`;

export type CcFreeDevice = {
  iccid: string;
  status: string;
  imsi: string | null;
  msisdn: string | null;
  ctdUsageMb: number | null;
};

function ccFreeStockWhere(): string {
  return `${CC_STATUS_KEY} IN ${CC_FREE_STATUSES}
         AND UPPER(TRIM(IFNULL(d.rate_plan, ''))) = UPPER(TRIM(?))
         AND UPPER(TRIM(IFNULL(d.communication_plan, ''))) = UPPER(TRIM(?))
         AND NOT EXISTS (SELECT 1 FROM sims s WHERE s.iccid = d.iccid)`;
}

export async function countAvailableCcStock(ccRatePlan: string, commPlan: string): Promise<number> {
  const row = await getDB()
    .prepare(`SELECT COUNT(*) AS c FROM cc_devices d WHERE ${ccFreeStockWhere()}`)
    .bind(ccRatePlan, commPlan)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function pickAvailableCcDevices(
  ccRatePlan: string,
  commPlan: string,
  quantity: number,
): Promise<CcFreeDevice[]> {
  const rows = await getDB()
    .prepare(
      `SELECT d.iccid, d.status, d.imsi, d.msisdn, d.ctd_usage_mb
       FROM cc_devices d
       WHERE ${ccFreeStockWhere()}
       ORDER BY CASE WHEN d.date_added IS NULL OR TRIM(d.date_added) = '' THEN 1 ELSE 0 END,
                d.date_added ASC,
                d.iccid ASC
       LIMIT ?`,
    )
    .bind(ccRatePlan, commPlan, quantity)
    .all<{
      iccid: string;
      status: string;
      imsi: string | null;
      msisdn: string | null;
      ctd_usage_mb: number | null;
    }>();
  return (rows.results ?? []).map((row) => ({
    iccid: row.iccid,
    status: row.status,
    imsi: row.imsi,
    msisdn: row.msisdn,
    ctdUsageMb: row.ctd_usage_mb,
  }));
}

export async function getCcSyncState(): Promise<CcSyncState> {
  const row = await getDB()
    .prepare(
      `SELECT modified_since, next_page, locked_until, last_polled_at, last_error, last_total, last_page, last_page_complete, auto_poll
       FROM cc_sync_state WHERE id = ?`,
    )
    .bind(SYNC_ID)
    .first<{
      modified_since: string | null;
      next_page: number;
      locked_until: string | null;
      last_polled_at: string | null;
      last_error: string | null;
      last_total: number | null;
      last_page: number | null;
      last_page_complete: number;
      auto_poll: number | null;
    }>();
  return {
    modifiedSince: row?.modified_since ?? null,
    nextPage: row?.next_page ?? 1,
    lockedUntil: row?.locked_until ?? null,
    lastPolledAt: row?.last_polled_at ?? null,
    lastError: isOverlapError(row?.last_error) ? null : (row?.last_error ?? null),
    lastTotal: row?.last_total ?? null,
    lastPage: row?.last_page ?? null,
    lastPageComplete: Boolean(row?.last_page_complete),
    autoPoll: Boolean(row?.auto_poll) && isCcAutoPollEnabled(),
    configured: jasperConfigured(),
  };
}

export async function setCcAutoPoll(enabled: boolean): Promise<void> {
  await ensureSyncRow();
  await getDB()
    .prepare(`UPDATE cc_sync_state SET auto_poll = ? WHERE id = ?`)
    .bind(enabled ? 1 : 0, SYNC_ID)
    .run();
}

/** Cron entry. Runs when the Auto poll button is ON (and CC_AUTO_POLL is not false). */
export async function runScheduledCcPoll(): Promise<CcSyncResult | null> {
  if (!jasperConfigured()) return null;
  const state = await getCcSyncState();
  if (!state.autoPoll) return null;
  try {
    return await syncCcDevices({ unlimited: true });
  } catch (err) {
    if (err instanceof CcBusyError) return null;
    throw err;
  }
}

const CC_DEVICE_COLUMNS = `iccid, IFNULL(NULLIF(TRIM(supplier), ''), '${DEFAULT_PLAN_SUPPLIER}') AS supplier,
              status, rate_plan, communication_plan, imsi, msisdn, ctd_usage_mb, in_session,
              date_added, date_activated, polled_at, details_polled_at,
              imei, customer, end_consumer_id, date_updated, date_shipped, account_id,
              fixed_ip_address, fixed_ipv6_address, sim_notes, device_id, modem_id,
              global_sim_type, mec, euiccid, sim_profile_id, custom_fields`;

type CcDeviceRow = {
  iccid: string;
  supplier: string | null;
  status: string;
  rate_plan: string | null;
  communication_plan: string | null;
  imsi: string | null;
  msisdn: string | null;
  ctd_usage_mb: number | null;
  in_session: number | null;
  date_added: string | null;
  date_activated: string | null;
  polled_at: string;
  details_polled_at: string | null;
  imei: string | null;
  customer: string | null;
  end_consumer_id: string | null;
  date_updated: string | null;
  date_shipped: string | null;
  account_id: string | null;
  fixed_ip_address: string | null;
  fixed_ipv6_address: string | null;
  sim_notes: string | null;
  device_id: string | null;
  modem_id: string | null;
  global_sim_type: string | null;
  mec: string | null;
  euiccid: string | null;
  sim_profile_id: string | null;
  custom_fields: string | null;
};

function parseCustomFields(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value == null) continue;
      const text = String(value).trim();
      if (text) out[key] = text;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

function mapCcDevice(row: CcDeviceRow): CcDevice {
  return {
    iccid: row.iccid,
    supplier: normalizePlanSupplier(row.supplier),
    status: row.status,
    ratePlan: row.rate_plan,
    communicationPlan: row.communication_plan,
    imsi: row.imsi,
    msisdn: row.msisdn,
    imei: row.imei,
    customer: row.customer,
    endConsumerId: row.end_consumer_id,
    ctdUsageMb: row.ctd_usage_mb,
    inSession: row.in_session == null ? null : Boolean(row.in_session),
    dateAdded: row.date_added,
    dateActivated: row.date_activated,
    dateUpdated: row.date_updated,
    dateShipped: row.date_shipped,
    accountId: row.account_id,
    fixedIpAddress: row.fixed_ip_address,
    fixedIpv6Address: row.fixed_ipv6_address,
    simNotes: row.sim_notes,
    deviceId: row.device_id,
    modemId: row.modem_id,
    globalSimType: row.global_sim_type,
    mec: row.mec,
    euiccid: row.euiccid,
    simProfileId: row.sim_profile_id,
    customFields: parseCustomFields(row.custom_fields),
    polledAt: row.polled_at,
    detailsPolledAt: row.details_polled_at,
  };
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text && text.toLowerCase() !== "null" ? text : null;
}

function packCustomFields(details: JasperDevice): string | null {
  const custom: Record<string, string> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!/^(operator|account|customer)Custom\d+$/i.test(key)) continue;
    const text = textOrNull(value);
    if (text) custom[key] = text;
  }
  return Object.keys(custom).length ? JSON.stringify(custom) : null;
}

export type CcDeviceFilter = {
  query?: string;
  supplier?: string;
  status?: string;
  ratePlan?: string;
  communicationPlan?: string;
  customer?: string;
  accountId?: string;
  modemId?: string;
  globalSimType?: string;
  simProfileId?: string;
  inSession?: "yes" | "no" | "";
  dateField?: "added" | "activated" | "updated" | "";
  dateFrom?: string;
  dateTo?: string;
};

export type CcFilterOptions = {
  suppliers: string[];
  statuses: string[];
  ratePlans: string[];
  communicationPlans: string[];
  customers: string[];
  accountIds: string[];
  modemIds: string[];
  globalSimTypes: string[];
  simProfileIds: string[];
};

function clipFilter(value: string | undefined, max = 120): string {
  return (value ?? "").trim().slice(0, max);
}

export function normalizeCcFilter(input: string | CcDeviceFilter = {}): CcDeviceFilter {
  if (typeof input === "string") return { query: clipFilter(input) };
  const inSession = input.inSession === "yes" || input.inSession === "no" ? input.inSession : "";
  const dateField =
    input.dateField === "added" || input.dateField === "activated" || input.dateField === "updated"
      ? input.dateField
      : "";
  let dateFrom = parseYmd(input.dateFrom)?.key ?? "";
  let dateTo = parseYmd(input.dateTo)?.key ?? "";
  if (dateFrom && dateTo && dateFrom > dateTo) {
    const swap = dateFrom;
    dateFrom = dateTo;
    dateTo = swap;
  }
  return {
    query: clipFilter(input.query),
    supplier: clipFilter(input.supplier),
    status: clipFilter(input.status),
    ratePlan: clipFilter(input.ratePlan),
    communicationPlan: clipFilter(input.communicationPlan),
    customer: clipFilter(input.customer),
    accountId: clipFilter(input.accountId),
    modemId: clipFilter(input.modemId),
    globalSimType: clipFilter(input.globalSimType),
    simProfileId: clipFilter(input.simProfileId),
    inSession,
    dateField: dateFrom || dateTo ? dateField || "added" : dateField,
    dateFrom,
    dateTo,
  };
}

export function ccFilterActive(filter: CcDeviceFilter): boolean {
  const normalized = normalizeCcFilter(filter);
  return Boolean(
    normalized.query ||
      normalized.supplier ||
      normalized.status ||
      normalized.ratePlan ||
      normalized.communicationPlan ||
      normalized.customer ||
      normalized.accountId ||
      normalized.modemId ||
      normalized.globalSimType ||
      normalized.simProfileId ||
      normalized.inSession ||
      normalized.dateFrom ||
      normalized.dateTo,
  );
}

function ccWhere(filter: string | CcDeviceFilter): { sql: string; binds: (string | number)[] } {
  const normalized = normalizeCcFilter(filter);
  const clauses: string[] = [];
  const binds: (string | number)[] = [];
  if (normalized.query) {
    clauses.push(
      `(iccid LIKE ? OR IFNULL(imsi,'') LIKE ? OR IFNULL(msisdn,'') LIKE ? OR IFNULL(imei,'') LIKE ?
        OR IFNULL(customer,'') LIKE ? OR IFNULL(account_id,'') LIKE ? OR IFNULL(device_id,'') LIKE ?
        OR IFNULL(euiccid,'') LIKE ? OR IFNULL(sim_profile_id,'') LIKE ? OR IFNULL(modem_id,'') LIKE ?
        OR IFNULL(supplier,'') LIKE ? OR IFNULL(sim_notes,'') LIKE ? OR IFNULL(custom_fields,'') LIKE ?)`,
    );
    const q = normalized.query;
    const digits = `%${q.replace(/\s/g, "")}%`;
    const text = `%${q}%`;
    binds.push(digits, text, text, text, text, text, text, text, text, text, text, text, text);
  }
  if (normalized.supplier) {
    clauses.push("IFNULL(NULLIF(TRIM(supplier), ''), ?) = ?");
    binds.push(DEFAULT_PLAN_SUPPLIER, normalized.supplier);
  }
  if (normalized.status) {
    clauses.push("UPPER(status) = UPPER(?)");
    binds.push(normalized.status);
  }
  if (normalized.ratePlan) {
    clauses.push("rate_plan = ?");
    binds.push(normalized.ratePlan);
  }
  if (normalized.communicationPlan) {
    clauses.push("communication_plan = ?");
    binds.push(normalized.communicationPlan);
  }
  if (normalized.customer) {
    clauses.push("customer = ?");
    binds.push(normalized.customer);
  }
  if (normalized.accountId) {
    clauses.push("account_id = ?");
    binds.push(normalized.accountId);
  }
  if (normalized.modemId) {
    clauses.push("modem_id = ?");
    binds.push(normalized.modemId);
  }
  if (normalized.globalSimType) {
    clauses.push("global_sim_type = ?");
    binds.push(normalized.globalSimType);
  }
  if (normalized.simProfileId) {
    clauses.push("sim_profile_id = ?");
    binds.push(normalized.simProfileId);
  }
  if (normalized.inSession === "yes") clauses.push("in_session = 1");
  if (normalized.inSession === "no") clauses.push("in_session = 0");
  const dateColumn =
    normalized.dateField === "activated"
      ? "date_activated"
      : normalized.dateField === "updated"
        ? "date_updated"
        : normalized.dateField === "added"
          ? "date_added"
          : null;
  if (dateColumn && (normalized.dateFrom || normalized.dateTo)) {
    const startIso = normalized.dateFrom ? sydneyDayStartIso(normalized.dateFrom) : null;
    const endExclusiveIso = normalized.dateTo ? sydneyDayEndExclusiveIso(normalized.dateTo) : null;
    const instant = `datetime(replace(substr(trim(${dateColumn}), 1, 19), 'T', ' '))`;
    clauses.push(`${dateColumn} IS NOT NULL AND trim(${dateColumn}) != ''`);
    if (startIso) {
      clauses.push(`${instant} >= datetime(?)`);
      binds.push(startIso.slice(0, 19).replace("T", " "));
    }
    if (endExclusiveIso) {
      clauses.push(`${instant} < datetime(?)`);
      binds.push(endExclusiveIso.slice(0, 19).replace("T", " "));
    }
  }
  return {
    sql: clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "",
    binds,
  };
}

export async function listCcDevices(
  queryOrFilter: string | CcDeviceFilter = "",
  limit = 50,
  offset = 0,
): Promise<CcDevice[]> {
  const { sql, binds } = ccWhere(queryOrFilter);
  /** UI pages stay small; export may request up to 1,000 per chunk. */
  const safeLimit = Math.max(1, Math.min(limit, 1_000));
  const safeOffset = Math.max(0, offset);
  const rows = await getDB()
    .prepare(
      `SELECT ${CC_DEVICE_COLUMNS}
       FROM cc_devices${sql}
       ORDER BY polled_at DESC, iccid ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, safeLimit, safeOffset)
    .all<CcDeviceRow>();
  return (rows.results ?? []).map(mapCcDevice);
}

export async function countCcDevices(queryOrFilter: string | CcDeviceFilter = ""): Promise<number> {
  const { sql, binds } = ccWhere(queryOrFilter);
  const row = await getDB()
    .prepare(`SELECT COUNT(*) as c FROM cc_devices${sql}`)
    .bind(...binds)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

async function distinctCcValues(column: string): Promise<string[]> {
  // Column names are fixed call-site strings only — never user input.
  const rows = await getDB()
    .prepare(
      `SELECT DISTINCT ${column} AS value FROM cc_devices
       WHERE ${column} IS NOT NULL AND TRIM(${column}) != ''
       ORDER BY ${column} COLLATE NOCASE
       LIMIT 500`,
    )
    .all<{ value: string }>();
  return (rows.results ?? []).map((row) => row.value);
}

export async function listCcFilterOptions(): Promise<CcFilterOptions> {
  const [suppliers, statuses, ratePlans, communicationPlans, customers, accountIds, modemIds, globalSimTypes, simProfileIds] =
    await Promise.all([
      distinctCcValues("supplier"),
      distinctCcValues("status"),
      distinctCcValues("rate_plan"),
      distinctCcValues("communication_plan"),
      distinctCcValues("customer"),
      distinctCcValues("account_id"),
      distinctCcValues("modem_id"),
      distinctCcValues("global_sim_type"),
      distinctCcValues("sim_profile_id"),
    ]);
  const listedSuppliers = suppliers.includes(DEFAULT_PLAN_SUPPLIER)
    ? suppliers
    : [DEFAULT_PLAN_SUPPLIER, ...suppliers];
  return {
    suppliers: listedSuppliers,
    statuses,
    ratePlans,
    communicationPlans,
    customers,
    accountIds,
    modemIds,
    globalSimTypes,
    simProfileIds,
  };
}

export async function ccInventorySummary(): Promise<{
  total: number;
  activated: number;
  inSession: number;
  usageMb: number;
}> {
  const row = await getDB()
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN UPPER(status) IN ('ACTIVATED','ACTIVE') THEN 1 ELSE 0 END) as activated,
              SUM(CASE WHEN in_session = 1 THEN 1 ELSE 0 END) as in_session,
              IFNULL(SUM(ctd_usage_mb), 0) as usage_mb
       FROM cc_devices`,
    )
    .first<{ total: number; activated: number; in_session: number; usage_mb: number }>();
  return {
    total: row?.total ?? 0,
    activated: row?.activated ?? 0,
    inSession: row?.in_session ?? 0,
    usageMb: row?.usage_mb ?? 0,
  };
}

async function ensureSyncRow(): Promise<void> {
  await getDB()
    .prepare(
      `INSERT INTO cc_sync_state (id, next_page, last_page_complete, auto_poll) VALUES (?, 1, 0, 1) ON CONFLICT(id) DO NOTHING`,
    )
    .bind(SYNC_ID)
    .run();
}

async function acquireLock(): Promise<boolean> {
  await ensureSyncRow();
  const now = isoNow();
  const until = new Date(Date.now() + LOCK_MS).toISOString();
  const row = await getDB()
    .prepare(
      `UPDATE cc_sync_state
       SET locked_until = ?
       WHERE id = ? AND (locked_until IS NULL OR locked_until < ?)`,
    )
    .bind(until, SYNC_ID, now)
    .run();
  return (row.meta.changes ?? 0) > 0;
}

async function heartbeatLock(progress?: {
  nextPage?: number;
  lastTotal?: number;
  lastPage?: number;
  lastPageComplete?: boolean;
}): Promise<void> {
  const until = new Date(Date.now() + LOCK_MS).toISOString();
  await getDB()
    .prepare(
      `UPDATE cc_sync_state
       SET locked_until = ?,
           next_page = COALESCE(?, next_page),
           last_total = COALESCE(?, last_total),
           last_page = COALESCE(?, last_page),
           last_page_complete = COALESCE(?, last_page_complete)
       WHERE id = ?`,
    )
    .bind(
      until,
      progress?.nextPage ?? null,
      progress?.lastTotal ?? null,
      progress?.lastPage ?? null,
      progress?.lastPageComplete == null ? null : progress.lastPageComplete ? 1 : 0,
      SYNC_ID,
    )
    .run();
}

async function releaseLock(patch: {
  modifiedSince?: string;
  nextPage?: number;
  lastPolledAt?: string;
  lastError?: string | null;
  lastTotal?: number;
  lastPage?: number;
  lastPageComplete?: boolean;
}): Promise<void> {
  await getDB()
    .prepare(
      `UPDATE cc_sync_state
       SET locked_until = NULL,
           modified_since = COALESCE(?, modified_since),
           next_page = COALESCE(?, next_page),
           last_polled_at = COALESCE(?, last_polled_at),
           last_error = ?,
           last_total = COALESCE(?, last_total),
           last_page = COALESCE(?, last_page),
           last_page_complete = COALESCE(?, last_page_complete)
       WHERE id = ?`,
    )
    .bind(
      patch.modifiedSince ?? null,
      patch.nextPage ?? null,
      patch.lastPolledAt ?? null,
      patch.lastError === undefined ? null : patch.lastError,
      patch.lastTotal ?? null,
      patch.lastPage ?? null,
      patch.lastPageComplete == null ? null : patch.lastPageComplete ? 1 : 0,
      SYNC_ID,
    )
    .run();
}

async function overlaySim(
  iccid: string,
  input: {
    status: string;
    ratePlan?: string | null;
    polledAt: string;
    imsi?: string | null;
    msisdn?: string | null;
    usageMb?: number | null;
  },
): Promise<void> {
  await overlaySimStatement(iccid, input).run();
}

function overlaySimStatement(
  iccid: string,
  input: {
    status: string;
    ratePlan?: string | null;
    polledAt: string;
    imsi?: string | null;
    msisdn?: string | null;
    usageMb?: number | null;
  },
) {
  const mapped = mapCcStatus(input.status);
  return getDB()
    .prepare(
      `UPDATE sims
       SET wholesale_plan = COALESCE(?, wholesale_plan),
           cc_status = ?,
           cc_polled_at = ?,
           imsi = COALESCE(?, imsi),
           msisdn = COALESCE(?, msisdn),
           current_volume_mb = COALESCE(?, current_volume_mb),
           state = CASE WHEN ? IS NOT NULL THEN ? ELSE state END
       WHERE iccid = ?`,
    )
    .bind(
      input.ratePlan ?? null,
      input.status,
      input.polledAt,
      input.imsi ?? null,
      input.msisdn ?? null,
      input.usageMb ?? null,
      mapped,
      mapped,
      iccid,
    );
}

async function persistDevices(devices: JasperDevice[], polledAt: string): Promise<number> {
  const db = getDB();
  const upserts: D1PreparedStatement[] = [];
  const overlays: D1PreparedStatement[] = [];
  for (const device of devices) {
    const iccid = device.iccid.replace(/\s/g, "");
    if (!iccid) continue;
    upserts.push(
      db
        .prepare(
          `INSERT INTO cc_devices (iccid, supplier, status, rate_plan, communication_plan, polled_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(iccid) DO UPDATE SET
           supplier = excluded.supplier,
           status = excluded.status,
           rate_plan = excluded.rate_plan,
           communication_plan = excluded.communication_plan,
           polled_at = excluded.polled_at`,
        )
        .bind(
          iccid,
          DEFAULT_PLAN_SUPPLIER,
          device.status,
          device.ratePlan ?? null,
          device.communicationPlan ?? null,
          polledAt,
        ),
    );
    overlays.push(
      overlaySimStatement(iccid, {
        status: device.status,
        ratePlan: device.ratePlan,
        polledAt,
      }),
    );
  }
  if (upserts.length > 0) await db.batch(upserts);
  if (overlays.length > 0) await db.batch(overlays);
  return upserts.length;
}

async function fetchDeviceDetailsBatch(iccids: string[]): Promise<Map<string, JasperDevice>> {
  const map = new Map<string, JasperDevice>();
  const cleaned = [...new Set(iccids.map((value) => value.replace(/\s/g, "")).filter(Boolean))];
  if (cleaned.length === 0) return map;

  if (bulkDetailsAvailable !== false && cleaned.length >= 1) {
    try {
      const devices = await fetchJasperBulkDevices(cleaned);
      if (devices) {
        bulkDetailsAvailable = true;
        for (const device of devices) {
          const iccid = device.iccid.replace(/\s/g, "");
          if (iccid) map.set(iccid, device);
        }
        return map;
      }
      // 404 — endpoint not on this CC tier.
      bulkDetailsAvailable = false;
    } catch {
      // Role denied / invalid path — fall back for the rest of this sync.
      bulkDetailsAvailable = false;
    }
  }

  for (const iccid of cleaned) {
    if (!jasperHasBudget()) break;
    const details = await fetchJasperDeviceDetails(iccid);
    if (details) map.set(iccid, details);
  }
  return map;
}

async function persistDeviceEnrichment(
  iccid: string,
  details: JasperDevice | null,
  usage: Awaited<ReturnType<typeof fetchJasperCtdUsage>>,
  session: Awaited<ReturnType<typeof fetchJasperSessionInfo>>,
): Promise<void> {
  const now = isoNow();
  const status = details?.status ?? usage?.status ?? "";
  const ratePlan = details?.ratePlan ?? usage?.ratePlan ?? null;
  const communicationPlan = details?.communicationPlan ?? usage?.communicationPlan ?? null;
  const imsi = textOrNull(details?.imsi ?? usage?.imsi);
  const msisdn = textOrNull(details?.msisdn ?? usage?.msisdn);
  const usageMb = bytesToMb(usage?.ctdDataUsage);
  const inSession = session ? (sessionActive(session.dateSessionStarted, session.dateSessionEnded) ? 1 : 0) : null;
  const customFields = details ? packCustomFields(details) : null;
  const detailsJson = details ? JSON.stringify(details) : null;

  await getDB()
    .prepare(
      `UPDATE cc_devices
       SET status = CASE WHEN ? != '' THEN ? ELSE status END,
           rate_plan = COALESCE(?, rate_plan),
           communication_plan = COALESCE(?, communication_plan),
           imsi = COALESCE(?, imsi),
           msisdn = COALESCE(?, msisdn),
           imei = COALESCE(?, imei),
           customer = COALESCE(?, customer),
           end_consumer_id = COALESCE(?, end_consumer_id),
           ctd_usage_mb = COALESCE(?, ctd_usage_mb),
           in_session = COALESCE(?, in_session),
           date_added = COALESCE(?, date_added),
           date_activated = COALESCE(?, date_activated),
           date_updated = COALESCE(?, date_updated),
           date_shipped = COALESCE(?, date_shipped),
           account_id = COALESCE(?, account_id),
           fixed_ip_address = COALESCE(?, fixed_ip_address),
           fixed_ipv6_address = COALESCE(?, fixed_ipv6_address),
           sim_notes = COALESCE(?, sim_notes),
           device_id = COALESCE(?, device_id),
           modem_id = COALESCE(?, modem_id),
           global_sim_type = COALESCE(?, global_sim_type),
           mec = COALESCE(?, mec),
           euiccid = COALESCE(?, euiccid),
           sim_profile_id = COALESCE(?, sim_profile_id),
           custom_fields = COALESCE(?, custom_fields),
           details_json = COALESCE(?, details_json),
           details_polled_at = ?,
           polled_at = ?
       WHERE iccid = ?`,
    )
    .bind(
      status,
      status,
      ratePlan,
      communicationPlan,
      imsi,
      msisdn,
      textOrNull(details?.imei),
      textOrNull(details?.customer),
      textOrNull(details?.endConsumerId),
      usageMb,
      inSession,
      textOrNull(details?.dateAdded),
      textOrNull(details?.dateActivated),
      textOrNull(details?.dateUpdated),
      textOrNull(details?.dateShipped),
      textOrNull(details?.accountId),
      textOrNull(details?.fixedIPAddress),
      textOrNull(details?.fixedIpv6Address),
      textOrNull(details?.simNotes),
      textOrNull(details?.deviceID),
      textOrNull(details?.modemID),
      textOrNull(details?.globalSimType),
      textOrNull(details?.mec),
      textOrNull(details?.euiccid),
      textOrNull(details?.simProfileId),
      customFields,
      detailsJson,
      now,
      now,
      iccid,
    )
    .run();

  if (status) {
    await overlaySim(iccid, { status, ratePlan, polledAt: now, imsi, msisdn, usageMb });
  }
}

async function enrichStaleDevices(input: { unlimited: boolean; deadline: number }): Promise<number> {
  const staleBefore = new Date(Date.now() - DETAILS_STALE_MS).toISOString();
  const batch = input.unlimited
    ? JASPER_BULK_DEVICE_LIMIT
    : Math.min(MANUAL_DETAILS_PER_RUN, JASPER_BULK_DEVICE_LIMIT);
  let enriched = 0;
  while (Date.now() < input.deadline) {
    // Bulk details = 1 call; usage+session still 2 each — reserve budget for a full batch when possible.
    const need = bulkDetailsAvailable === false ? batch * 3 : 1 + batch * 2;
    if (!jasperHasBudget(Math.min(need, 3))) return enriched;

    const rows = await getDB()
      .prepare(
        `SELECT iccid FROM cc_devices
         WHERE details_polled_at IS NULL OR details_polled_at < ?
         ORDER BY details_polled_at IS NULL DESC, details_polled_at ASC
         LIMIT ?`,
      )
      .bind(staleBefore, batch)
      .all<{ iccid: string }>();
    const devices = rows.results ?? [];
    if (devices.length === 0) break;

    const iccids = devices.map((row) => row.iccid);
    const detailsMap = await fetchDeviceDetailsBatch(iccids);

    for (const iccid of iccids) {
      if (Date.now() >= input.deadline) return enriched;
      if (!jasperHasBudget(2)) return enriched;
      const usage = await fetchJasperCtdUsage(iccid);
      const session = await fetchJasperSessionInfo(iccid);
      await persistDeviceEnrichment(iccid, detailsMap.get(iccid) ?? null, usage, session);
      enriched += 1;
      if (enriched % 10 === 0) await heartbeatLock();
    }
    if (!input.unlimited) break;
  }
  return enriched;
}

export async function syncCcDevices(input?: { unlimited?: boolean }): Promise<CcSyncResult> {
  if (!jasperConfigured()) {
    throw new Error("Control Center secrets are not configured (JASPER_ACCOUNT_NAME, JASPER_API_KEY).");
  }
  const unlimited = Boolean(input?.unlimited);
  const deadline = Date.now() + (unlimited ? AUTO_BUDGET_MS : MANUAL_BUDGET_MS);
  beginJasperBudget(unlimited ? JASPER_CALLS_AUTO : JASPER_CALLS_MANUAL);
  bulkDetailsAvailable = null;
  const locked = await acquireLock();
  if (!locked) throw new CcBusyError();

  const state = await getCcSyncState();
  const pollStarted = isoNow().replace(/\.\d{3}Z$/, "+00:00");
  const modifiedSince = state.modifiedSince || defaultModifiedSince();
  let page = state.nextPage || 1;
  let upserted = 0;
  let pages = 0;
  let details = 0;
  let lastPage = false;
  let totalCount = state.lastTotal ?? 0;
  let fetchedPage = page;

  try {
    const maxPages = unlimited ? Number.POSITIVE_INFINITY : MANUAL_PAGES_PER_RUN;
    while (pages < maxPages && Date.now() < deadline && jasperHasBudget()) {
      // Identical search: same account, modifiedSince, pageSize=50; only pageNumber increases.
      const result = await fetchJasperDevicesPage({ modifiedSince, pageNumber: page });
      upserted += await persistDevices(result.devices, isoNow());
      pages += 1;
      lastPage = result.lastPage;
      totalCount = result.totalCount;
      fetchedPage = result.pageNumber;
      if (result.lastPage) {
        page = 1;
        await heartbeatLock({ nextPage: 1, lastTotal: totalCount, lastPage: fetchedPage, lastPageComplete: true });
        break;
      }
      page += 1;
      await heartbeatLock({ nextPage: page, lastTotal: totalCount, lastPage: fetchedPage, lastPageComplete: false });
    }

    details = await enrichStaleDevices({ unlimited, deadline });

    await releaseLock({
      modifiedSince: lastPage ? pollStarted : modifiedSince,
      nextPage: page,
      lastPolledAt: isoNow(),
      lastError: null,
      lastTotal: totalCount,
      lastPage: fetchedPage,
      lastPageComplete: lastPage,
    });

    return { pages, upserted, details, lastPage, totalCount, nextPage: page };
  } catch (err) {
    if (err instanceof CcBusyError) {
      await dropLock();
      throw err;
    }
    if (isSubrequestLimit(err) || err instanceof CcBudgetError || err instanceof CcRateLimitError) {
      const rateLimited = err instanceof CcRateLimitError;
      await releaseLock({
        modifiedSince: lastPage ? pollStarted : modifiedSince,
        nextPage: page,
        lastPolledAt: isoNow(),
        lastError: rateLimited
          ? "Rate limited by Control Center. Progress saved — wait ~1 minute, then Sync again (do not mash Sync)."
          : null,
        lastTotal: totalCount,
        lastPage: fetchedPage,
        lastPageComplete: lastPage,
      });
      return { pages, upserted, details, lastPage, totalCount, nextPage: page };
    }
    const message = err instanceof Error ? err.message : "Control Center sync failed.";
    await releaseLock({ lastError: message, lastPolledAt: isoNow() });
    throw err;
  }
}

function isOverlapError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /already in flight|already running/i.test(message);
}

async function dropLock(): Promise<void> {
  await getDB()
    .prepare(
      `UPDATE cc_sync_state
       SET locked_until = NULL,
           last_error = CASE
             WHEN last_error LIKE '%already in flight%' OR last_error LIKE '%already running%' THEN NULL
             ELSE last_error
           END
       WHERE id = ?`,
    )
    .bind(SYNC_ID)
    .run();
}

function isSubrequestLimit(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /too many subrequests/i.test(message);
}

const IMPORT_MAX_PER_RUN = 25;
const IMPORT_BUDGET_MS = 45_000;
const IMPORT_JASPER_CALLS = 55;
const EXPORT_PAGE_SIZE = 500;

export type CcImportResult = {
  requested: number;
  imported: number;
  notFound: string[];
  failed: string[];
  rateLimited: boolean;
  remaining: number;
};

/**
 * Seed / refresh SIMs by ICCID via Get Device (+ usage/session).
 * Used for estate stock that Jasper Search Devices never returns (idle > ~1 year).
 * Processes up to IMPORT_MAX_PER_RUN per call — send remaining in follow-up requests.
 */
export async function importCcIccids(iccids: string[]): Promise<CcImportResult> {
  if (!jasperConfigured()) {
    throw new Error("Control Center secrets are not configured (JASPER_ACCOUNT_NAME, JASPER_API_KEY).");
  }
  const cleaned = [
    ...new Set(iccids.map((value) => value.replace(/\s/g, "")).filter((value) => /^\d{15,22}$/.test(value))),
  ];
  const batch = cleaned.slice(0, IMPORT_MAX_PER_RUN);
  const remaining = Math.max(0, cleaned.length - batch.length);
  if (batch.length === 0) {
    return { requested: 0, imported: 0, notFound: [], failed: [], rateLimited: false, remaining: 0 };
  }

  const locked = await acquireLock();
  if (!locked) throw new CcBusyError();

  beginJasperBudget(IMPORT_JASPER_CALLS);
  bulkDetailsAvailable = null;
  const deadline = Date.now() + IMPORT_BUDGET_MS;
  let imported = 0;
  const notFound: string[] = [];
  const failed: string[] = [];
  let rateLimited = false;

  try {
    const detailsMap = await fetchDeviceDetailsBatch(batch);
    for (const iccid of batch) {
      if (Date.now() >= deadline || !jasperHasBudget(2)) {
        rateLimited = true;
        break;
      }
      const details = detailsMap.get(iccid) ?? null;
      if (!details) {
        notFound.push(iccid);
        continue;
      }
      try {
        await persistDevices([details], isoNow());
        const usage = await fetchJasperCtdUsage(iccid);
        const session = await fetchJasperSessionInfo(iccid);
        await persistDeviceEnrichment(iccid, details, usage, session);
        imported += 1;
      } catch (err) {
        if (err instanceof CcRateLimitError || err instanceof CcBudgetError) {
          rateLimited = true;
          break;
        }
        failed.push(iccid);
      }
    }
    await releaseLock({ lastPolledAt: isoNow(), lastError: null });
  } catch (err) {
    if (err instanceof CcBusyError) {
      await dropLock();
      throw err;
    }
    if (err instanceof CcRateLimitError || err instanceof CcBudgetError || isSubrequestLimit(err)) {
      rateLimited = true;
      await releaseLock({
        lastPolledAt: isoNow(),
        lastError: "Import paused (rate limit or budget). Progress kept — run Import again for the rest.",
      });
    } else {
      const message = err instanceof Error ? err.message : "Import failed.";
      await releaseLock({ lastError: message, lastPolledAt: isoNow() });
      throw err;
    }
  }

  return {
    requested: batch.length,
    imported,
    notFound,
    failed,
    rateLimited,
    remaining,
  };
}

/** Full D1 CC snapshot as CSV for the current filtered view (all matching rows). */
export async function exportCcDevicesCsv(filter: CcDeviceFilter = {}): Promise<string> {
  const devices: CcDevice[] = [];
  let offset = 0;
  while (true) {
    const page = await listCcDevices(filter, EXPORT_PAGE_SIZE, offset);
    if (page.length === 0) break;
    devices.push(...page);
    offset += page.length;
    // Keep paging until D1 returns an empty page (do not stop on a short last chunk).
  }
  return ccDevicesToCsv(devices);
}
