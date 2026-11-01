"use client";

import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RetailPlanRowActions({
  id,
  name,
  simCount,
}: {
  id: string;
  name: string;
  simCount: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"rename" | "delete" | "reassign" | null>(null);
  const [nextName, setNextName] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (mode !== "rename" && mode !== "delete") return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "rename"
            ? { action: "rename", id, name: nextName }
            : { action: "delete", id },
        ),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Update failed.");
        return;
      }
      setMode(null);
      window.location.reload();
    } catch {
      setError("Update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setError("");
            setNextName(name);
            setMode("rename");
          }}
          className="rounded-lg border border-line px-2 py-1 text-[11px] text-quiet hover:border-accent hover:text-ink"
        >
          Rename
        </button>
        <button
          type="button"
          onClick={() => {
            setError("");
            setMode(simCount > 0 ? "reassign" : "delete");
          }}
          className="rounded-lg border border-line px-2 py-1 text-[11px] text-danger hover:border-danger"
        >
          Remove
        </button>
      </div>

      {mode === "rename" ? (
        <ConfirmDialog
          open
          title="Rename retail plan?"
          body={
            <label className="block text-sm">
              Name
              <input
                value={nextName}
                onChange={(event) => setNextName(event.target.value)}
                className="mt-2 h-10 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink"
                autoFocus
              />
              <span className="mt-2 block text-xs text-quiet">
                SIMs that use this plan will show the new name automatically.
              </span>
            </label>
          }
          confirmLabel="Save name"
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) setMode(null);
          }}
          onConfirm={() => void submit()}
        />
      ) : null}

      {mode === "delete" ? (
        <ConfirmDialog
          open
          title="Remove this retail plan?"
          body={
            <p>
              Remove <span className="font-medium text-ink">{name}</span>. This only works when no
              SIMs are assigned to it.
            </p>
          }
          confirmLabel="Remove"
          tone="danger"
          busy={busy}
          error={error}
          requireName={name}
          onClose={() => {
            if (!busy) setMode(null);
          }}
          onConfirm={() => void submit()}
        />
      ) : null}

      {mode === "reassign" ? (
        <ConfirmDialog
          open
          title="Reassign SIMs first"
          body={
            <p>
              <span className="font-medium text-ink">{name}</span> is on{" "}
              <span className="font-medium text-ink">{simCount}</span> SIM
              {simCount === 1 ? "" : "s"}. Open SIMs filtered to this plan, bulk-change them to another
              retail plan, then come back to remove it.
            </p>
          }
          confirmLabel="Open SIMs"
          tone="accent"
          busy={false}
          error=""
          onClose={() => setMode(null)}
          onConfirm={() => {
            router.push(`/dashboard/sims?plan=${encodeURIComponent(id)}`);
          }}
        />
      ) : null}
    </>
  );
}
