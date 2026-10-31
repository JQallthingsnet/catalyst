"use client";

import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { useState } from "react";

export function CustomerRowActions({
  id,
  name,
  simCount,
}: {
  id: string;
  name: string;
  simCount: number;
}) {
  const [mode, setMode] = useState<"rename" | "delete" | null>(null);
  const [nextName, setNextName] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!mode) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/customers", {
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
            setMode("delete");
          }}
          className="rounded-lg border border-line px-2 py-1 text-[11px] text-danger hover:border-danger"
        >
          Remove
        </button>
      </div>

      {mode === "rename" ? (
        <ConfirmDialog
          open
          title="Rename customer?"
          body={
            <label className="block text-sm">
              Name
              <input
                value={nextName}
                onChange={(event) => setNextName(event.target.value)}
                className="mt-2 h-10 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink"
                autoFocus
              />
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
          title="Remove this customer?"
          body={
            <p>
              Remove <span className="font-medium text-ink">{name}</span>
              {simCount > 0 ? (
                <>
                  .{" "}
                  <span className="font-medium text-ink">{simCount}</span> assigned SIM
                  {simCount === 1 ? "" : "s"} will stay in your inventory with no end customer.
                </>
              ) : (
                "."
              )}
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
    </>
  );
}
