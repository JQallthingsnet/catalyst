"use client";

import { useEffect, useRef, useState } from "react";

type ModemRow = {
  modemId: string;
  allowanceMb: number | null;
};

export function ModemAllowancesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<ModemRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const draftsRef = useRef(drafts);
  const baselineRef = useRef(baseline);
  draftsRef.current = drafts;
  baselineRef.current = baseline;

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
        setBaseline(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load modem_IDs.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function persistAll(current: Record<string, string>, previous: Record<string, string>) {
    const changes: { modemId: string; raw: string }[] = [];
    for (const modemId of Object.keys(current)) {
      const raw = (current[modemId] ?? "").trim();
      const prev = (previous[modemId] ?? "").trim();
      if (raw !== prev) changes.push({ modemId, raw });
    }
    if (changes.length === 0) return;

    setBusy(true);
    setError("");
    try {
      for (const change of changes) {
        const res = await fetch("/api/portal/pools", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            change.raw === ""
              ? { modemId: change.modemId, clear: true }
              : { modemId: change.modemId, allowanceMb: Number(change.raw) },
          ),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? `Could not save ${change.modemId}.`);
      }
      setBaseline({ ...current });
      setRows((existing) =>
        existing.map((row) => {
          const raw = (current[row.modemId] ?? "").trim();
          return { ...row, allowanceMb: raw === "" ? null : Number(raw) };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    try {
      await persistAll(drafts, baseline);
    } catch {
      // error already set
    }
  }

  async function handleClose() {
    try {
      await persistAll(draftsRef.current, baselineRef.current);
      onClose();
    } catch {
      // keep dialog open so the user can fix / retry
    }
  }

  if (!open) return null;

  const filtered = rows.filter((row) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return row.modemId.toLowerCase().includes(needle);
  });

  const dirty = Object.keys(drafts).some(
    (id) => (drafts[id] ?? "").trim() !== (baseline[id] ?? "").trim(),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-card border border-line bg-panel shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Modem allowances</h2>
            <p className="mt-1 text-sm text-quiet">
              Manual MB per modem_ID. Applied to every SIM with that ID when pooling.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleClose()}
            disabled={busy}
            className="text-sm text-quiet hover:text-ink disabled:opacity-40"
          >
            Close
          </button>
        </div>
        <div className="border-b border-line px-5 py-3">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Filter modem_ID"
            className="h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm outline-none focus:border-accent"
          />
        </div>
        {error ? <p className="px-5 pt-3 text-sm text-danger">{error}</p> : null}
        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          <table className="w-full text-left text-sm">
            <thead className="text-quiet">
              <tr>
                <th className="py-2">modem_ID</th>
                <th className="py-2">Allowance MB</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.modemId} className="border-t border-line">
                  <td className="py-2 font-mono text-xs">{row.modemId}</td>
                  <td className="py-2">
                    <input
                      value={drafts[row.modemId] ?? ""}
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [row.modemId]: event.target.value }))
                      }
                      placeholder="—"
                      className="w-32 rounded-lg border border-line bg-canvas px-2 py-1 font-mono text-xs"
                    />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-8 text-quiet">
                    No modem_IDs in the CC snapshot yet. Sync devices first.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={() => void handleClose()}
            disabled={busy}
            className="rounded-card border border-line px-4 py-2 text-sm hover:border-accent disabled:opacity-40"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void saveAll()}
            disabled={busy || !dirty}
            className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
