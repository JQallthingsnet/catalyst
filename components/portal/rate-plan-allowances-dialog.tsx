"use client";

import { useEffect, useRef, useState } from "react";

type RatePlanRow = {
  ratePlan: string;
  allowanceMb: number | null;
  allowanceSms: number | null;
  allowanceVoiceMin: number | null;
};

type Draft = { mb: string; sms: string; voice: string };

function draftFromRow(row: RatePlanRow): Draft {
  return {
    mb: row.allowanceMb != null ? String(row.allowanceMb) : "",
    sms: row.allowanceSms != null ? String(row.allowanceSms) : "",
    voice: row.allowanceVoiceMin != null ? String(row.allowanceVoiceMin) : "",
  };
}

function parseField(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  return Number(text);
}

function draftsEqual(a: Draft | undefined, b: Draft | undefined): boolean {
  if (!a || !b) return a === b;
  return a.mb.trim() === b.mb.trim() && a.sms.trim() === b.sms.trim() && a.voice.trim() === b.voice.trim();
}

export function RatePlanAllowancesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<RatePlanRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [baseline, setBaseline] = useState<Record<string, Draft>>({});
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
        const res = await fetch("/api/portal/pools?view=rate_plans");
        const data = (await res.json()) as { ratePlans?: RatePlanRow[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not load rate plans.");
        if (cancelled) return;
        const plans = data.ratePlans ?? [];
        setRows(plans);
        const next: Record<string, Draft> = {};
        for (const row of plans) next[row.ratePlan] = draftFromRow(row);
        setDrafts(next);
        setBaseline(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load rate plans.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function persistAll(current: Record<string, Draft>, previous: Record<string, Draft>) {
    const changes: { ratePlan: string; draft: Draft }[] = [];
    for (const ratePlan of Object.keys(current)) {
      if (!draftsEqual(current[ratePlan], previous[ratePlan])) {
        changes.push({ ratePlan, draft: current[ratePlan] ?? { mb: "", sms: "", voice: "" } });
      }
    }
    if (changes.length === 0) return;

    setBusy(true);
    setError("");
    try {
      for (const change of changes) {
        const mb = parseField(change.draft.mb);
        const sms = parseField(change.draft.sms);
        const voice = parseField(change.draft.voice);
        const clear = mb == null && sms == null && voice == null;
        const res = await fetch("/api/portal/pools", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            clear
              ? { ratePlan: change.ratePlan, clear: true }
              : {
                  ratePlan: change.ratePlan,
                  allowanceMb: mb,
                  allowanceSms: sms,
                  allowanceVoiceMin: voice,
                },
          ),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? `Could not save ${change.ratePlan}.`);
      }
      const snap = await fetch("/api/portal/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const snapData = (await snap.json()) as { error?: string };
      if (!snap.ok) throw new Error(snapData.error ?? "Saved allowances but pool snapshot failed.");
      setBaseline({ ...current });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    try {
      await persistAll(draftsRef.current, baselineRef.current);
      onClose();
      window.location.reload();
    } catch {
      // keep open
    }
  }

  if (!open) return null;

  const filtered = rows.filter((row) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return row.ratePlan.toLowerCase().includes(needle);
  });

  const dirty = Object.keys(drafts).some((id) => !draftsEqual(drafts[id], baseline[id]));

  function setField(ratePlan: string, field: keyof Draft, value: string) {
    setDrafts((current) => ({
      ...current,
      [ratePlan]: {
        mb: current[ratePlan]?.mb ?? "",
        sms: current[ratePlan]?.sms ?? "",
        voice: current[ratePlan]?.voice ?? "",
        [field]: value,
      },
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-card border border-line bg-panel shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Supplier code allowances</h2>
            <p className="mt-1 text-sm text-quiet">
              Inclusive data (MB), SMS (msgs), and voice (min) per Supplier code.{" "}
              <span className="text-ink">0 = PAYG</span>. Leave blank to clear.
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
            placeholder="Filter Supplier code"
            className="h-10 w-full rounded-full border border-line bg-canvas px-4 text-sm outline-none focus:border-accent"
          />
        </div>
        {error ? <p className="px-5 pt-3 text-sm text-danger">{error}</p> : null}
        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          <table className="w-full text-left text-sm">
            <thead className="text-quiet">
              <tr>
                <th className="py-2">Supplier code</th>
                <th className="py-2">Data MB</th>
                <th className="py-2">SMS</th>
                <th className="py-2">Voice (min)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const draft = drafts[row.ratePlan] ?? { mb: "", sms: "", voice: "" };
                return (
                  <tr key={row.ratePlan} className="border-t border-line">
                    <td className="py-2 pr-3 text-xs">{row.ratePlan}</td>
                    <td className="py-2 pr-2">
                      <input
                        value={draft.mb}
                        onChange={(event) => setField(row.ratePlan, "mb", event.target.value)}
                        placeholder="—"
                        title="0 = PAYG"
                        className="w-24 rounded-lg border border-line bg-canvas px-2 py-1 font-mono text-xs"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={draft.sms}
                        onChange={(event) => setField(row.ratePlan, "sms", event.target.value)}
                        placeholder="—"
                        title="0 = PAYG"
                        className="w-24 rounded-lg border border-line bg-canvas px-2 py-1 font-mono text-xs"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        value={draft.voice}
                        onChange={(event) => setField(row.ratePlan, "voice", event.target.value)}
                        placeholder="—"
                        title="0 = PAYG"
                        className="w-24 rounded-lg border border-line bg-canvas px-2 py-1 font-mono text-xs"
                      />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-quiet">
                    No rate plans in the CC snapshot yet. Sync devices first.
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
            disabled={busy || !dirty}
            onClick={() => void persistAll(drafts, baseline).then(() => window.location.reload())}
            className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
