"use client";

import { useEffect, useState } from "react";

type ModemRow = {
  modemId: string;
  allowanceMb: number | null;
  customer: string | null;
  simCount: number;
  ctdUsageMb: number;
};

export function ModemAllowancesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<ModemRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setError("");
      try {
        const res = await fetch("/api/portal/pools?view=modems");
        const data = (await res.json()) as { modems?: ModemRow[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not load modem_IDs.");
        if (cancelled) return;
        const modems = data.modems ?? [];
        setRows(modems);
        const next: Record<string, string> = {};
        for (const row of modems) {
          next[row.modemId] = row.allowanceMb != null ? String(row.allowanceMb) : "";
        }
        setDrafts(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load modem_IDs.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function save(modemId: string) {
    setBusy(true);
    setError("");
    try {
      const raw = (drafts[modemId] ?? "").trim();
      const res = await fetch("/api/portal/pools", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          raw === ""
            ? { modemId, clear: true }
            : { modemId, allowanceMb: Number(raw) },
        ),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      setRows((current) =>
        current.map((row) =>
          row.modemId === modemId
            ? { ...row, allowanceMb: raw === "" ? null : Number(raw) }
            : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const filtered = rows.filter((row) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (
      row.modemId.toLowerCase().includes(needle) ||
      (row.customer ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-card border border-line bg-panel shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Modem allowances</h2>
            <p className="mt-1 text-sm text-quiet">
              Manual MB allowance per Jasper modem_ID. Customer pool cap = sum of its modem_IDs.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-quiet hover:text-ink">
            Close
          </button>
        </div>
        <div className="border-b border-line px-5 py-3">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Filter modem_ID or CC customer"
            className="h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm outline-none focus:border-accent"
          />
        </div>
        {error ? <p className="px-5 pt-3 text-sm text-danger">{error}</p> : null}
        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          <table className="w-full text-left text-sm">
            <thead className="text-quiet">
              <tr>
                <th className="py-2">modem_ID</th>
                <th>CC customer</th>
                <th>SIMs</th>
                <th>CTD MB</th>
                <th>Allowance MB</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.modemId} className="border-t border-line">
                  <td className="py-2 font-mono text-xs">{row.modemId}</td>
                  <td className="py-2">{row.customer ?? "—"}</td>
                  <td className="py-2">{row.simCount}</td>
                  <td className="py-2">{row.ctdUsageMb.toLocaleString("en-AU", { maximumFractionDigits: 1 })}</td>
                  <td className="py-2">
                    <input
                      value={drafts[row.modemId] ?? ""}
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [row.modemId]: event.target.value }))
                      }
                      placeholder="—"
                      className="w-28 rounded-lg border border-line bg-canvas px-2 py-1 font-mono text-xs"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => save(row.modemId)}
                      className="text-sm text-accent disabled:opacity-40"
                    >
                      Save
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-quiet">
                    No modem_IDs in the CC snapshot yet. Sync devices first.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
