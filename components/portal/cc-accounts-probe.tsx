"use client";

import { useState } from "react";

type AccountRow = {
  accountId: string;
  accountName: string | null;
  status: string | null;
  parentAccountId: string | null;
};

type ProbeResult = {
  error?: string | null;
  echoOk?: boolean;
  source?: "accounts_api" | "device_sample" | "none";
  accounts?: AccountRow[];
  configuredAccount?: AccountRow | null;
  notes?: string[];
  config?: {
    configured: boolean;
    accountNameSet: boolean;
    apiKeySet: boolean;
    accountId: string | null;
    apiBase: string;
  };
};

export function CcAccountsProbe() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/portal/cc-accounts", { method: "POST" });
      const data = (await res.json()) as ProbeResult;
      setResult(data);
    } catch {
      setResult({ error: "Probe failed." });
    } finally {
      setBusy(false);
    }
  }

  const accounts = result?.accounts ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-medium text-accent-ink disabled:opacity-40"
        >
          {busy ? "Probing Control Center…" : "Verify accounts"}
        </button>
        {result ? (
          <p className="text-sm text-quiet">
            {accounts.length} account{accounts.length === 1 ? "" : "s"}
            {result.source === "accounts_api"
              ? " · from /accounts"
              : result.source === "device_sample"
                ? " · sampled from devices"
                : ""}
          </p>
        ) : (
          <p className="text-sm text-quiet">Live call — uses a small Jasper request budget.</p>
        )}
      </div>

      {result?.error ? (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{result.error}</p>
      ) : null}

      {result?.config ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="API user"
            value={result.config.accountNameSet ? "Set" : "Missing"}
            ok={result.config.accountNameSet}
          />
          <Stat label="API key" value={result.config.apiKeySet ? "Set" : "Missing"} ok={result.config.apiKeySet} />
          <Stat
            label="JASPER_ACCOUNT_ID"
            value={result.config.accountId ?? "Not set"}
            ok={Boolean(result.config.accountId)}
          />
          <Stat label="Echo" value={result.echoOk ? "OK" : "Failed"} ok={Boolean(result.echoOk)} />
        </div>
      ) : null}

      {result?.notes?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-quiet">
          {result.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      {result ? (
        <div className="overflow-x-auto rounded-card border border-line bg-panel">
          <table className="w-full min-w-160 text-left text-sm">
            <thead className="border-b border-line text-quiet">
              <tr>
                <th className="px-4 py-3 font-medium">Account ID</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Parent</th>
                <th className="px-4 py-3 font-medium">Sync target</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const isTarget = result.config?.accountId === account.accountId;
                return (
                  <tr key={account.accountId} className="border-t border-line">
                    <td className="px-4 py-3 font-mono text-xs">{account.accountId}</td>
                    <td className="px-4 py-3">{account.accountName ?? "—"}</td>
                    <td className="px-4 py-3 text-quiet">{account.status ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-quiet">
                      {account.parentAccountId ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {isTarget ? <span className="text-ok">Current JASPER_ACCOUNT_ID</span> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {accounts.length === 0 ? (
            <p className="px-4 py-8 text-sm text-quiet">
              No accounts returned. If Echo failed, fix secrets. If Echo OK but the table is empty, this API user may
              not expose /accounts and the device sample found no accountIds.
            </p>
          ) : null}
        </div>
      ) : null}

      {result?.config?.apiBase ? (
        <p className="text-xs text-quiet">API base: {result.config.apiBase}</p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <article className="rounded-card border border-line bg-panel p-4">
      <p className="text-xs text-quiet">{label}</p>
      <p className={`mt-1 text-sm font-medium ${ok ? "text-ok" : "text-danger"}`}>{value}</p>
    </article>
  );
}
