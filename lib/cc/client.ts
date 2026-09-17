import { getEnv } from "@/lib/env";

const DEFAULT_BASE = "https://restapi1.jasper.com/rws/api/v1";
const PAGE_SIZE = 50;
const MIN_INTERVAL_MS = 200;

let lastCallAt = 0;
let inFlight = false;

export type JasperDevice = {
  iccid: string;
  status: string;
  ratePlan?: string;
  communicationPlan?: string;
  imsi?: string;
  msisdn?: string;
  dateAdded?: string;
  dateActivated?: string;
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
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
}

async function jasperGet<T>(path: string, allow404 = false): Promise<T | null> {
  if (!jasperConfigured()) {
    throw new Error("Control Center secrets are not configured (JASPER_ACCOUNT_NAME, JASPER_API_KEY).");
  }
  if (inFlight) throw new Error("A Control Center request is already in flight.");
  inFlight = true;
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
    if (!res.ok) throw new Error(`Control Center returned HTTP ${res.status}.`);
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

export async function fetchJasperCtdUsage(iccid: string): Promise<JasperCtdUsage | null> {
  return jasperGet<JasperCtdUsage>(`/devices/${encodeURIComponent(iccid)}/ctdUsages`, true);
}

export async function fetchJasperSessionInfo(iccid: string): Promise<JasperSessionInfo | null> {
  return jasperGet<JasperSessionInfo>(`/devices/${encodeURIComponent(iccid)}/sessionInfo`, true);
}
