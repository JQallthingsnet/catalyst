import { getEnv } from "@/lib/env";

const DEFAULT_BASE = "https://restapi1.jasper.com/rws/api/v1";
const PAGE_SIZE = 50;
/**
 * Optus soft-throttles this account (esp. sessionInfo → 30000001). Keep a single
 * in-flight call; ~2/s — session soft-fails are per-SIM, not account-wide.
 */
const MIN_INTERVAL_MS = 500;
const MAX_429_RETRIES = 3;

let lastCallAt = 0;
/** One Jasper call at a time — never concurrent. */
let inFlight = 0;
const MAX_IN_FLIGHT = 1;
let throttleChain: Promise<void> = Promise.resolve();
let jasperCalls = 0;
let jasperCallLimit = 0;

export class CcBudgetError extends Error {
  constructor() {
    super("Control Center run reached the Worker subrequest budget.");
    this.name = "CcBudgetError";
  }
}

export class CcBusyError extends Error {
  constructor() {
    super("A Control Center request is already in flight.");
    this.name = "CcBusyError";
  }
}

export class CcRateLimitError extends Error {
  constructor(detail?: string) {
    super(
      detail?.trim()
        ? detail
        : "Control Center rate limit exceeded. Progress saved — wait a minute, then Sync again.",
    );
    this.name = "CcRateLimitError";
  }
}

export function beginJasperBudget(maxCalls: number): void {
  jasperCalls = 0;
  jasperCallLimit = maxCalls;
}

export function jasperHasBudget(need = 1): boolean {
  return jasperCalls + need <= jasperCallLimit;
}

/** Jasper GETs still allowed in this tick (soft cap from beginJasperBudget). */
export function jasperCallsRemaining(): number {
  return Math.max(0, jasperCallLimit - jasperCalls);
}

export type JasperDevice = {
  iccid: string;
  status: string;
  ratePlan?: string;
  communicationPlan?: string;
  imsi?: string;
  msisdn?: string;
  imei?: string;
  customer?: string | null;
  endConsumerId?: string | null;
  dateAdded?: string;
  dateActivated?: string;
  dateUpdated?: string;
  dateShipped?: string;
  accountId?: string | number;
  accountName?: string;
  fixedIPAddress?: string | null;
  fixedIpv6Address?: string | null;
  simNotes?: string | null;
  deviceID?: string | null;
  modemID?: string | null;
  globalSimType?: string | null;
  mec?: string | null;
  euiccid?: string | null;
  simProfileId?: string | null;
  operatorCustom1?: string | null;
  operatorCustom2?: string | null;
  operatorCustom3?: string | null;
  operatorCustom4?: string | null;
  operatorCustom5?: string | null;
  accountCustom1?: string | null;
  accountCustom2?: string | null;
  accountCustom3?: string | null;
  accountCustom4?: string | null;
  accountCustom5?: string | null;
  accountCustom6?: string | null;
  accountCustom7?: string | null;
  accountCustom8?: string | null;
  accountCustom9?: string | null;
  accountCustom10?: string | null;
  customerCustom1?: string | null;
  customerCustom2?: string | null;
  customerCustom3?: string | null;
  customerCustom4?: string | null;
  customerCustom5?: string | null;
  [key: string]: unknown;
};

export type JasperDevicesPage = {
  devices: JasperDevice[];
  pageNumber: number;
  lastPage: boolean;
  totalCount: number;
};

export type JasperCtdUsage = {
  iccid?: string;
  ctdDataUsage?: number;
  imsi?: string;
  msisdn?: string;
  status?: string;
  ratePlan?: string;
  communicationPlan?: string;
};

export type JasperSessionInfo = {
  iccid?: string;
  dateSessionStarted?: string | null;
  dateSessionEnded?: string | null;
  ipAddress?: string | null;
  apn?: string | null;
};

export function jasperConfigured(): boolean {
  return Boolean(jasperAccountName() && jasperApiKey());
}

function jasperAccountName(): string {
  return getEnv().JASPER_ACCOUNT_NAME?.trim() ?? "";
}

function jasperApiKey(): string {
  return getEnv().JASPER_API_KEY?.trim() ?? "";
}

function jasperAccountId(): string {
  return getEnv().JASPER_ACCOUNT_ID?.trim() ?? "";
}

function authorizationHeader(): string {
  const token = btoa(`${jasperAccountName()}:${jasperApiKey()}`);
  return `Basic ${token}`;
}

function apiBase(): string {
  return (getEnv().JASPER_API_BASE?.trim() || DEFAULT_BASE).replace(/\/$/, "");
}

async function throttle(): Promise<void> {
  // Chain so concurrent jasperGet callers still respect MIN_INTERVAL_MS spacing.
  const run = throttleChain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
  });
  throttleChain = run.catch(() => {});
  await run;
}

type JasperErrorBody = {
  errorMessage?: string;
  errorCode?: string | number;
  message?: string;
};

function formatJasperError(status: number, body: JasperErrorBody | null): string {
  const fallback = `Control Center returned HTTP ${status}.`;
  if (!body) return fallback;
  const detail = body.errorMessage || body.message;
  if (!detail) return fallback;
  return body.errorCode != null ? `${fallback} ${body.errorCode}: ${detail}` : `${fallback} ${detail}`;
}

async function readJasperError(res: Response): Promise<{ message: string; body: JasperErrorBody | null }> {
  try {
    const body = (await res.json()) as JasperErrorBody;
    return { message: formatJasperError(res.status, body), body };
  } catch {
    return { message: formatJasperError(res.status, null), body: null };
  }
}

/**
 * Optus/Jasper often answers quota pressure with HTTP 500 + 30000001
 * ("Unknown server error") rather than 429. Treat those as soft rate limits.
 */
function isJasperSoftRateLimit(status: number, body: JasperErrorBody | null, message: string): boolean {
  if (status === 429) return true;
  const code = body?.errorCode != null ? String(body.errorCode) : "";
  if (code === "30000001" || code === "40000029") return true;
  return /too many|rate limit|throttl/i.test(message);
}

async function jasperRequest<T>(
  method: "GET" | "PUT",
  path: string,
  options?: {
    allow404?: boolean;
    /** When false, soft RL (30000001) throws immediately — enrich soft-catches sessionInfo. */
    softRetry?: boolean;
    body?: Record<string, unknown>;
  },
): Promise<T | null> {
  const allow404 = options?.allow404 ?? false;
  const softRetry = options?.softRetry ?? true;
  if (!jasperConfigured()) {
    throw new Error("Control Center secrets are not configured (JASPER_ACCOUNT_NAME, JASPER_API_KEY).");
  }
  if (inFlight >= MAX_IN_FLIGHT) throw new CcBusyError();
  if (!jasperHasBudget()) throw new CcBudgetError();
  inFlight += 1;
  jasperCalls += 1;
  try {
    let attempt = 0;
    while (true) {
      await throttle();
      const headers: Record<string, string> = {
        accept: "application/json",
        Authorization: authorizationHeader(),
      };
      if (options?.body) headers["Content-Type"] = "application/json";
      const res = await fetch(`${apiBase()}${path}`, {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });
      if (allow404 && res.status === 404) return null;
      // Edit Device Details: 200 immediate, 202 scheduled.
      if (!res.ok && !(method === "PUT" && res.status === 202)) {
        const { message, body } = await readJasperError(res);
        if (isJasperSoftRateLimit(res.status, body, message)) {
          attempt += 1;
          if (!softRetry || attempt > MAX_429_RETRIES) {
            // Always throw — callers soft-catch so CTD can still persist when
            // sessionInfo returns 30000001 (works for many SIMs, flaky for some).
            throw new CcRateLimitError(message);
          }
          const delayMs = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          lastCallAt = Date.now();
          continue;
        }
        throw new Error(message);
      }
      if (res.status === 204 || res.status === 202) return null;
      const text = await res.text();
      if (!text.trim()) return null;
      return JSON.parse(text) as T;
    }
  } finally {
    inFlight = Math.max(0, inFlight - 1);
  }
}

async function jasperGet<T>(
  path: string,
  allow404 = false,
  softRetry = true,
): Promise<T | null> {
  return jasperRequest<T>("GET", path, { allow404, softRetry });
}

/**
 * Edit Device Details — change SIM status in Control Center.
 * @see https://developer.cisco.com/docs/control-center/edit-device-details/
 */
export async function updateJasperDeviceStatus(
  iccid: string,
  status: "ACTIVATED" | "DEACTIVATED",
): Promise<void> {
  const cleaned = iccid.replace(/\s/g, "");
  await jasperRequest("PUT", `/devices/${encodeURIComponent(cleaned)}`, {
    body: { status },
  });
}

export async function fetchJasperDevicesPage(input: {
  modifiedSince: string;
  pageNumber: number;
}): Promise<JasperDevicesPage> {
  const params = new URLSearchParams({
    modifiedSince: input.modifiedSince,
    pageSize: String(PAGE_SIZE),
    pageNumber: String(input.pageNumber),
  });
  const accountId = jasperAccountId();
  if (accountId) params.set("accountId", accountId);
  const body = await jasperGet<{
    devices?: JasperDevice[];
    pageNumber?: number;
    lastPage?: boolean;
    totalCount?: number;
  }>(`/devices?${params.toString()}`);
  if (!body) throw new Error("Control Center returned an empty device list.");
  return {
    devices: (body.devices ?? []).filter((item) => item.iccid),
    pageNumber: body.pageNumber ?? input.pageNumber,
    lastPage: Boolean(body.lastPage),
    totalCount: body.totalCount ?? 0,
  };
}

export async function fetchJasperDeviceDetails(iccid: string): Promise<JasperDevice | null> {
  return jasperGet<JasperDevice>(`/devices/${encodeURIComponent(iccid)}`, true);
}

/** Max ICCIDs per bulk path segment (keeps the URL under typical gateway limits). */
export const JASPER_BULK_DEVICE_LIMIT = 50;

/**
 * Production Control Center bulk device details:
 * GET /bulk/devices/{iccid1,iccid2,...}
 * Not on the public sandbox function list — returns null on 404; throws on other errors.
 */
export async function fetchJasperBulkDevices(iccids: string[]): Promise<JasperDevice[] | null> {
  const cleaned = [
    ...new Set(iccids.map((value) => value.replace(/\s/g, "")).filter(Boolean)),
  ].slice(0, JASPER_BULK_DEVICE_LIMIT);
  if (cleaned.length === 0) return [];
  // Commas must stay unencoded so Jasper parses the list.
  const body = await jasperGet<JasperDevice[] | { devices?: JasperDevice[]; deviceDetails?: JasperDevice[] }>(
    `/bulk/devices/${cleaned.join(",")}`,
    true,
  );
  if (body == null) return null;
  const list = Array.isArray(body) ? body : (body.devices ?? body.deviceDetails ?? []);
  return list.filter((item) => item?.iccid);
}

export async function fetchJasperCtdUsage(iccid: string): Promise<JasperCtdUsage | null> {
  return jasperGet<JasperCtdUsage>(`/devices/${encodeURIComponent(iccid)}/ctdUsages`, true);
}

export async function fetchJasperSessionInfo(iccid: string): Promise<JasperSessionInfo | null> {
  // Fail-fast on 30000001 — enrich soft-catches and keeps CTD; retries burn the tick.
  return jasperGet<JasperSessionInfo>(`/devices/${encodeURIComponent(iccid)}/sessionInfo`, true, false);
}

export type JasperProbeKind = "ctd" | "session" | "details";

export type JasperProbeResult = {
  kind: JasperProbeKind;
  iccid: string;
  path: string;
  httpStatus: number;
  ok: boolean;
  /** Parsed JSON when possible; otherwise raw text. */
  body: unknown;
  rawText: string;
  durationMs: number;
};

/**
 * One raw Control Center GET — no retries, no soft rate-limit classification.
 * For diagnosing whether the account is actually blocked vs our enrich path.
 */
export async function probeJasperEnrichCall(
  iccid: string,
  kind: JasperProbeKind = "ctd",
): Promise<JasperProbeResult> {
  if (!jasperConfigured()) {
    throw new Error("Control Center secrets are not configured (JASPER_ACCOUNT_NAME, JASPER_API_KEY).");
  }
  const cleaned = iccid.replace(/\s/g, "");
  if (!/^\d{15,22}$/.test(cleaned)) {
    throw new Error("ICCID must be 15–22 digits.");
  }
  const path =
    kind === "session"
      ? `/devices/${encodeURIComponent(cleaned)}/sessionInfo`
      : kind === "details"
        ? `/devices/${encodeURIComponent(cleaned)}`
        : `/devices/${encodeURIComponent(cleaned)}/ctdUsages`;

  await throttle();
  const started = Date.now();
  const res = await fetch(`${apiBase()}${path}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      Authorization: authorizationHeader(),
    },
  });
  const durationMs = Date.now() - started;
  const rawText = await res.text();
  let body: unknown = rawText;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    // keep raw text
  }
  return {
    kind,
    iccid: cleaned,
    path,
    httpStatus: res.status,
    ok: res.ok,
    body,
    rawText,
    durationMs,
  };
}
