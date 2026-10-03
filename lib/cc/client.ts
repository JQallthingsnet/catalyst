import { getEnv } from "@/lib/env";

const DEFAULT_BASE = "https://restapi1.jasper.com/rws/api/v1";
const PAGE_SIZE = 50;
const MIN_INTERVAL_MS = 200;

let lastCallAt = 0;
let inFlight = false;
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

export function beginJasperBudget(maxCalls: number): void {
  jasperCalls = 0;
  jasperCallLimit = maxCalls;
}

export function jasperHasBudget(need = 1): boolean {
  return jasperCalls + need <= jasperCallLimit;
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

export type JasperAccount = {
  accountId: string;
  accountName: string | null;
  status: string | null;
  parentAccountId: string | null;
};

export type JasperConfigSummary = {
  configured: boolean;
  accountNameSet: boolean;
  apiKeySet: boolean;
  accountId: string | null;
  apiBase: string;
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
};

export function jasperConfigured(): boolean {
  return Boolean(jasperAccountName() && jasperApiKey());
}

export function jasperConfigSummary(): JasperConfigSummary {
  const accountId = jasperAccountId();
  return {
    configured: jasperConfigured(),
    accountNameSet: Boolean(jasperAccountName()),
    apiKeySet: Boolean(jasperApiKey()),
    accountId: accountId || null,
    apiBase: apiBase(),
  };
}

function jasperAccountName(): string {
  return getEnv().JASPER_ACCOUNT_NAME?.trim() ?? "";
}

function jasperApiKey(): string {
  return getEnv().JASPER_API_KEY?.trim() ?? "";
}

export function jasperAccountId(): string {
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
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
}

async function jasperErrorMessage(res: Response): Promise<string> {
  const fallback = `Control Center returned HTTP ${res.status}.`;
  try {
    const body = (await res.json()) as {
      errorMessage?: string;
      errorCode?: string | number;
      message?: string;
    };
    const detail = body.errorMessage || body.message;
    if (!detail) return fallback;
    return body.errorCode != null ? `${fallback} ${body.errorCode}: ${detail}` : `${fallback} ${detail}`;
  } catch {
    return fallback;
  }
}

async function jasperGet<T>(path: string, allow404 = false): Promise<T | null> {
  if (!jasperConfigured()) {
    throw new Error("Control Center secrets are not configured (JASPER_ACCOUNT_NAME, JASPER_API_KEY).");
  }
  if (inFlight) throw new CcBusyError();
  if (!jasperHasBudget()) throw new CcBudgetError();
  inFlight = true;
  jasperCalls += 1;
  try {
    await throttle();
    const res = await fetch(`${apiBase()}${path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: authorizationHeader(),
      },
    });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) throw new Error(await jasperErrorMessage(res));
    return (await res.json()) as T;
  } finally {
    inFlight = false;
  }
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

function mapAccount(raw: Record<string, unknown>): JasperAccount | null {
  const id = raw.accountId ?? raw.id ?? raw.accountID;
  if (id == null || String(id).trim() === "") return null;
  const name = raw.accountName ?? raw.name ?? raw.account;
  const parent = raw.parentAccountId ?? raw.parentAccountID ?? raw.parentId;
  const status = raw.status ?? raw.accountStatus;
  return {
    accountId: String(id),
    accountName: name == null || String(name).trim() === "" ? null : String(name),
    status: status == null || String(status).trim() === "" ? null : String(status),
    parentAccountId: parent == null || String(parent).trim() === "" ? null : String(parent),
  };
}

/**
 * Operator / SP Control Center often exposes /accounts (not on the public sandbox function list).
 * Returns null when the endpoint is missing (404).
 */
export async function fetchJasperAccountsPage(pageNumber: number): Promise<{
  accounts: JasperAccount[];
  pageNumber: number;
  lastPage: boolean;
  totalCount: number;
} | null> {
  const params = new URLSearchParams({
    pageSize: String(PAGE_SIZE),
    pageNumber: String(pageNumber),
  });
  const body = await jasperGet<{
    accounts?: Record<string, unknown>[];
    pageNumber?: number;
    lastPage?: boolean;
    totalCount?: number;
  }>(`/accounts?${params.toString()}`, true);
  if (!body) return null;
  return {
    accounts: (body.accounts ?? []).map(mapAccount).filter((item): item is JasperAccount => Boolean(item)),
    pageNumber: body.pageNumber ?? pageNumber,
    lastPage: body.lastPage ?? true,
    totalCount: body.totalCount ?? (body.accounts?.length ?? 0),
  };
}

export async function fetchJasperAccount(accountId: string): Promise<JasperAccount | null> {
  const body = await jasperGet<Record<string, unknown>>(
    `/accounts/${encodeURIComponent(accountId)}`,
    true,
  );
  if (!body) return null;
  return mapAccount(body);
}

export async function fetchJasperEcho(): Promise<string | null> {
  const body = await jasperGet<{ value?: string } | string>(`/echo/catalyst`, true);
  if (body == null) return null;
  if (typeof body === "string") return body;
  return body.value ?? "ok";
}

export async function fetchJasperCtdUsage(iccid: string): Promise<JasperCtdUsage | null> {
  return jasperGet<JasperCtdUsage>(`/devices/${encodeURIComponent(iccid)}/ctdUsages`, true);
}

export async function fetchJasperSessionInfo(iccid: string): Promise<JasperSessionInfo | null> {
  return jasperGet<JasperSessionInfo>(`/devices/${encodeURIComponent(iccid)}/sessionInfo`, true);
}
