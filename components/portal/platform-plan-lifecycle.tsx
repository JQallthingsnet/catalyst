"use client";

import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function PlatformPlanLifecycle({
  planId,
  name,
  active,
  simCount,
}: {
  planId: string;
  name: string;
  active: boolean;
  simCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"deactivate" | "reactivate" | "delete" | null>(null);

  async function run() {
    if (!mode) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "delete") {
        const res = await fetch("/api/portal/platform-plans", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platformPlanId: planId, confirmName: name }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Delete failed.");
          return;
        }
        window.location.assign("/dashboard/plans");
        return;
      }
      const res = await fetch("/api/portal/platform-plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformPlanId: planId, active: mode === "reactivate" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Update failed.");
        return;
      }
      setMode(null);
      router.refresh();
    } catch {
      setError("Update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError("");
            setMode(active ? "deactivate" : "reactivate");
          }}
          className={`text-sm disabled:opacity-40 ${active ? "text-danger" : "text-accent"}`}
        >
          {active ? "Deactivate" : "Reactivate"}
        </button>
        {!active ? (
          <button
            type="button"
            disabled={busy || simCount > 0}
            title={simCount > 0 ? "Clear SIMs on this plan before deleting" : undefined}
            onClick={() => {
              setError("");
              setMode("delete");
            }}
            className="text-sm text-danger disabled:opacity-40"
          >
            Delete
          </button>
        ) : null}
      </div>
      {error && !mode ? <p className="max-w-xs text-right text-xs text-danger">{error}</p> : null}

      <ConfirmDialog
        open={mode === "deactivate"}
        title={`Deactivate ${name}?`}
        body={
          <p>
            Bound resellers will no longer see this plan, and you cannot sell stock or create retail plans from it until
            you reactivate. Existing SIMs stay in place.
          </p>
        }
        confirmLabel="Deactivate"
        tone="danger"
        busy={busy}
        error={error}
        onClose={() => {
          if (!busy) setMode(null);
        }}
        onConfirm={() => void run()}
      />
      <ConfirmDialog
        open={mode === "reactivate"}
        title={`Reactivate ${name}?`}
        body={<p>Bound resellers will see this plan again and can create retail plans from it. Sell stock becomes available.</p>}
        confirmLabel="Reactivate"
        tone="accent"
        busy={busy}
        error={error}
        onClose={() => {
          if (!busy) setMode(null);
        }}
        onConfirm={() => void run()}
      />
      <ConfirmDialog
        open={mode === "delete"}
        title={`Delete ${name}?`}
        body={
          <p>
            Permanently removes this ATN plan, its reseller contracts, and any retail copies with no SIMs. This cannot
            be undone.
          </p>
        }
        confirmLabel="Delete permanently"
        tone="danger"
        busy={busy}
        error={error}
        requireName={name}
        onClose={() => {
          if (!busy) setMode(null);
        }}
        onConfirm={() => void run()}
      />
    </div>
  );
}
