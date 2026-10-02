"use client";

/**
 * Shared confirm modal for destructive or irreversible portal actions.
 * Prefer this over window.confirm / window.prompt everywhere in the UI.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "accent",
  busy = false,
  error = "",
  requireName,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "accent" | "danger";
  busy?: boolean;
  error?: string;
  /** When set, user must type this exact name before Confirm is enabled. */
  requireName?: string;
  onConfirm: (typedName?: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) {
      setTyped("");
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      if (requireName) inputRef.current?.focus();
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, requireName, busy, onClose]);

  if (!open) return null;

  const nameOk = !requireName || typed.trim() === requireName;
  const confirmClass =
    tone === "danger"
      ? "bg-danger text-canvas hover:opacity-90"
      : "bg-accent text-accent-ink hover:opacity-90";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-canvas/70 backdrop-blur-sm"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-card border border-line bg-panel p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-ink">
          {title}
        </h2>
        <div className="mt-2 text-sm leading-6 text-quiet">{body}</div>
        {requireName ? (
          <label className="mt-4 block text-sm text-ink">
            Type <span className="font-medium text-accent">{requireName}</span> to confirm
            <input
              ref={inputRef}
              value={typed}
              disabled={busy}
              onChange={(event) => setTyped(event.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink"
              autoComplete="off"
            />
          </label>
        ) : null}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm text-ink hover:border-accent disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy || !nameOk}
            onClick={() => onConfirm(requireName ? typed : undefined)}
            className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-medium disabled:opacity-40 ${confirmClass}`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
