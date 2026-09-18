import { getDB, isCcAutoPollEnabled } from "@/lib/env";
import {
  beginJasperBudget,
  CcBudgetError,
  CcBusyError,
  fetchJasperCtdUsage,
  fetchJasperDeviceDetails,
  fetchJasperDevicesPage,
  fetchJasperSessionInfo,
  jasperConfigured,
  jasperHasBudget,
  type JasperDevice,
} from "@/lib/cc/client";
import { type SimState } from "@/lib/portal/catalogue";

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

export type CcDevice = {
  iccid: string;
  status: string;
  ratePlan: string | null;
  communicationPlan: string | null;
  imsi: string | null;
  msisdn: string | null;
  ctdUsageMb: number | null;
  inSession: boolean | null;
  dateAdded: string | null;
  dateActivated: string | null;
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

export async function listCcDevices(query = "", limit = 200): Promise<CcDevice[]> {
  const q = query.trim();
  const rows = await getDB()
    .prepare(
      `SELECT iccid, status, rate_plan, communication_plan, imsi, msisdn, ctd_usage_mb, in_session,
              date_added, date_activated, polled_at, details_polled_at
       FROM cc_devices
       WHERE ? = '' OR iccid LIKE ? OR IFNULL(imsi,'') LIKE ? OR IFNULL(msisdn,'') LIKE ?
       ORDER BY polled_at DESC, iccid ASC
       LIMIT ?`,
    )
    .bind(q, `%${q.replace(/\s/g, "")}%`, `%${q}%`, `%${q}%`, limit)
    .all<{
      iccid: string;
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
    }>();
  return (rows.results ?? []).map((row) => ({
    iccid: row.iccid,
    status: row.status,
    ratePlan: row.rate_plan,
    communicationPlan: row.communication_plan,
    imsi: row.imsi,
    msisdn: row.msisdn,
    ctdUsageMb: row.ctd_usage_mb,
    inSession: row.in_session == null ? null : Boolean(row.in_session),
    dateAdded: row.date_added,
    dateActivated: row.date_activated,
    polledAt: row.polled_at,
    detailsPolledAt: row.details_polled_at,
  }));
}

export async function countCcDevices(): Promise<number> {
  const row = await getDB().prepare("SELECT COUNT(*) as c FROM cc_devices").first<{ c: number }>();
  return row?.c ?? 0;
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
          `INSERT INTO cc_devices (iccid, status, rate_plan, communication_plan, polled_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(iccid) DO UPDATE SET
           status = excluded.status,
           rate_plan = excluded.rate_plan,
           communication_plan = excluded.communication_plan,
           polled_at = excluded.polled_at`,
        )
        .bind(iccid, device.status, device.ratePlan ?? null, device.communicationPlan ?? null, polledAt),
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

async function enrichStaleDevices(input: { unlimited: boolean; deadline: number }): Promise<number> {
  const staleBefore = new Date(Date.now() - DETAILS_STALE_MS).toISOString();
  const batch = input.unlimited ? 25 : MANUAL_DETAILS_PER_RUN;
  let enriched = 0;
  while (Date.now() < input.deadline) {
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
    for (const row of devices) {
      if (Date.now() >= input.deadline || !jasperHasBudget(3)) return enriched;
      await enrichDevice(row.iccid);
      enriched += 1;
      if (enriched % 5 === 0) await heartbeatLock();
    }
    if (!input.unlimited) break;
  }
  return enriched;
}

async function enrichDevice(iccid: string): Promise<void> {
  const details = await fetchJasperDeviceDetails(iccid);
  const usage = await fetchJasperCtdUsage(iccid);
  const session = await fetchJasperSessionInfo(iccid);
  const now = isoNow();
  const status = details?.status ?? usage?.status ?? "";
  const ratePlan = details?.ratePlan ?? usage?.ratePlan ?? null;
  const communicationPlan = details?.communicationPlan ?? usage?.communicationPlan ?? null;
  const imsi = details?.imsi ?? usage?.imsi ?? null;
  const msisdn = details?.msisdn ?? usage?.msisdn ?? null;
  const usageMb = bytesToMb(usage?.ctdDataUsage);
  const inSession = session ? (sessionActive(session.dateSessionStarted, session.dateSessionEnded) ? 1 : 0) : null;

  await getDB()
    .prepare(
      `UPDATE cc_devices
       SET status = CASE WHEN ? != '' THEN ? ELSE status END,
           rate_plan = COALESCE(?, rate_plan),
           communication_plan = COALESCE(?, communication_plan),
           imsi = COALESCE(?, imsi),
           msisdn = COALESCE(?, msisdn),
           ctd_usage_mb = COALESCE(?, ctd_usage_mb),
           in_session = COALESCE(?, in_session),
           date_added = COALESCE(?, date_added),
           date_activated = COALESCE(?, date_activated),
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
      usageMb,
      inSession,
      details?.dateAdded ?? null,
      details?.dateActivated ?? null,
      now,
      now,
      iccid,
    )
    .run();

  if (status) {
    await overlaySim(iccid, { status, ratePlan, polledAt: now, imsi, msisdn, usageMb });
  }
}

export async function syncCcDevices(input?: { unlimited?: boolean }): Promise<CcSyncResult> {
  if (!jasperConfigured()) {
    throw new Error("Control Center secrets are not configured (JASPER_ACCOUNT_NAME, JASPER_API_KEY).");
  }
  const unlimited = Boolean(input?.unlimited);
  const deadline = Date.now() + (unlimited ? AUTO_BUDGET_MS : MANUAL_BUDGET_MS);
  beginJasperBudget(unlimited ? JASPER_CALLS_AUTO : JASPER_CALLS_MANUAL);
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
    if (isSubrequestLimit(err) || err instanceof CcBudgetError) {
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
