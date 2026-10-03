import {
  beginJasperBudget,
  fetchJasperAccount,
  fetchJasperAccountsPage,
  fetchJasperDeviceDetails,
  fetchJasperDevicesPage,
  fetchJasperEcho,
  jasperAccountId,
  jasperConfigSummary,
  jasperConfigured,
  jasperHasBudget,
  type JasperAccount,
  type JasperConfigSummary,
} from "@/lib/cc/client";

export type CcAccountsProbeResult = {
  config: JasperConfigSummary;
  echoOk: boolean;
  source: "accounts_api" | "device_sample" | "none";
  accounts: JasperAccount[];
  configuredAccount: JasperAccount | null;
  notes: string[];
  error: string | null;
};

function defaultModifiedSince(): string {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 360);
  return start.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

function mergeAccount(map: Map<string, JasperAccount>, account: JasperAccount): void {
  const existing = map.get(account.accountId);
  if (!existing) {
    map.set(account.accountId, account);
    return;
  }
  map.set(account.accountId, {
    accountId: account.accountId,
    accountName: account.accountName ?? existing.accountName,
    status: account.status ?? existing.status,
    parentAccountId: account.parentAccountId ?? existing.parentAccountId,
  });
}

async function probeAccountsApi(map: Map<string, JasperAccount>, notes: string[]): Promise<boolean> {
  let page = 1;
  let sawEndpoint = false;
  try {
    while (page <= 20 && jasperHasBudget()) {
      const result = await fetchJasperAccountsPage(page);
      if (result == null) {
        if (page === 1) notes.push("GET /accounts is not available on this Control Center (404).");
        return sawEndpoint;
      }
      sawEndpoint = true;
      for (const account of result.accounts) mergeAccount(map, account);
      if (result.lastPage || result.accounts.length === 0) break;
      page += 1;
    }
  } catch (err) {
    notes.push(
      `GET /accounts failed: ${err instanceof Error ? err.message : "unknown error"}. Falling back to device sample.`,
    );
    return false;
  }
  if (sawEndpoint) {
    notes.push(`Listed ${map.size} account(s) from GET /accounts.`);
  }
  return sawEndpoint;
}

async function probeFromDevices(map: Map<string, JasperAccount>, notes: string[]): Promise<void> {
  if (!jasperHasBudget(2)) return;
  const modifiedSince = defaultModifiedSince();
  const page = await fetchJasperDevicesPage({ modifiedSince, pageNumber: 1 });
  notes.push(
    `Sampled device search page 1 (${page.devices.length} ICCIDs${page.totalCount ? `, totalCount ${page.totalCount}` : ""}).`,
  );

  let checked = 0;
  for (const device of page.devices) {
    if (!jasperHasBudget()) break;
    if (checked >= 20) break;
    const details = await fetchJasperDeviceDetails(device.iccid);
    checked += 1;
    const accountId = details?.accountId ?? device.accountId;
    if (accountId == null) continue;
    mergeAccount(map, {
      accountId: String(accountId),
      accountName: details?.accountName ? String(details.accountName) : null,
      status: details?.status ?? device.status ?? null,
      parentAccountId: null,
    });
  }
  notes.push(`Resolved ${map.size} distinct accountId(s) from ${checked} device detail call(s).`);
}

/**
 * Live probe of Control Center credentials and visible enterprise accounts under this API user.
 * Prefers operator GET /accounts; falls back to sampling device details for accountId.
 */
export async function probeCcAccounts(): Promise<CcAccountsProbeResult> {
  const config = jasperConfigSummary();
  const notes: string[] = [];
  if (!jasperConfigured()) {
    return {
      config,
      echoOk: false,
      source: "none",
      accounts: [],
      configuredAccount: null,
      notes: ["Set JASPER_ACCOUNT_NAME and JASPER_API_KEY Worker secrets first."],
      error: "Control Center secrets are not configured.",
    };
  }

  beginJasperBudget(40);
  const map = new Map<string, JasperAccount>();
  let echoOk = false;
  let source: CcAccountsProbeResult["source"] = "none";
  let configuredAccount: JasperAccount | null = null;
  let error: string | null = null;

  try {
    try {
      const echo = await fetchJasperEcho();
      echoOk = echo != null;
      notes.push(echoOk ? "Echo OK — credentials reach Control Center." : "Echo failed or returned empty.");
    } catch (err) {
      notes.push(`Echo failed: ${err instanceof Error ? err.message : "unknown error"}.`);
    }

    const configuredId = jasperAccountId();
    if (configuredId && jasperHasBudget()) {
      try {
        configuredAccount = await fetchJasperAccount(configuredId);
        if (configuredAccount) {
          mergeAccount(map, configuredAccount);
          notes.push(`Configured JASPER_ACCOUNT_ID ${configuredId} resolved via GET /accounts/{id}.`);
        } else {
          notes.push(
            `Configured JASPER_ACCOUNT_ID ${configuredId} — GET /accounts/{id} returned 404 or empty (may still work for /devices).`,
          );
        }
      } catch (err) {
        notes.push(
          `Configured JASPER_ACCOUNT_ID ${configuredId} — lookup failed: ${
            err instanceof Error ? err.message : "unknown error"
          }.`,
        );
      }
    } else if (!configuredId) {
      notes.push("JASPER_ACCOUNT_ID is not set — device search uses the username’s default account.");
    }

    const fromAccountsApi = await probeAccountsApi(map, notes);
    if (fromAccountsApi) {
      source = "accounts_api";
    } else {
      try {
        await probeFromDevices(map, notes);
        source = map.size > 0 ? "device_sample" : "none";
        if (source === "device_sample") {
          notes.push(
            "Public sandbox docs do not list /accounts; this sample only shows accounts that appear on recent devices.",
          );
        }
      } catch (err) {
        error = err instanceof Error ? err.message : "Device sample failed.";
        notes.push(`Device sample failed: ${error}`);
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Control Center probe failed.";
  }

  const accounts = [...map.values()].sort((a, b) => a.accountId.localeCompare(b.accountId));
  return { config, echoOk, source, accounts, configuredAccount, notes, error };
}
