"use client";

import { useEffect, useId, useRef, useState } from "react";

export type CatalogueSkuOption = {
  id: string;
  name: string;
  formFactor: string;
  active?: boolean;
};

export function CatalogueSkuMultiSelect({
  options,
  selectedIds,
  onChange,
  disabled,
  placeholder = "Select catalogue SKUs",
  label,
  showChips = false,
}: {
  options: CatalogueSkuOption[];
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  /** Show selected SKUs as chips under the control. */
  showChips?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.filter((item) => selectedIds.includes(item.id));
  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? `${selected[0].name} · ${selected[0].formFactor}`
        : `${selected.length} selected`;

  function toggle(id: string) {
    if (disabled) return;
    if (selectedIds.includes(id)) onChange(selectedIds.filter((item) => item !== id));
    else onChange([...selectedIds, id]);
  }

  if (options.length === 0) {
    return <p className="text-xs text-quiet">No catalogue SKUs available.</p>;
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-lg">
      {label ? <p className="mb-1.5 text-xs text-quiet">{label}</p> : null}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-canvas px-3 py-2.5 text-left text-sm hover:border-accent disabled:opacity-40 ${
          open ? "border-accent" : "border-line"
        }`}
      >
        <span className={selected.length === 0 ? "text-quiet" : "font-medium text-ink"}>{summary}</span>
        <span className="text-quiet" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {showChips && selected.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((sku) => (
            <li
              key={sku.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] text-ink"
            >
              {sku.name}
              <span className="text-quiet">{sku.formFactor}</span>
              {!disabled ? (
                <button
                  type="button"
                  title={`Remove ${sku.name}`}
                  onClick={() => toggle(sku.id)}
                  className="text-danger hover:underline"
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-panel py-1 shadow-lg"
        >
          {options.map((sku) => {
            const checked = selectedIds.includes(sku.id);
            return (
              <li key={sku.id} role="option" aria-selected={checked}>
                <button
                  type="button"
                  disabled={disabled || sku.active === false}
                  onClick={() => toggle(sku.id)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-panel-2 disabled:opacity-40 ${
                    checked ? "bg-panel-2/60" : ""
                  }`}
                >
                  <span
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[11px] leading-none ${
                      checked
                        ? "border-accent bg-accent font-semibold text-accent-ink"
                        : "border-line bg-canvas text-transparent"
                    }`}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink">{sku.name}</span>
                    <span className="ml-1.5 text-quiet">{sku.formFactor}</span>
                    {sku.active === false ? <span className="ml-1.5 text-danger">Deactivated</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
