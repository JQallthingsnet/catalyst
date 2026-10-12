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
}: {
  options: CatalogueSkuOption[];
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
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
        : `${selected.length} catalogue SKUs selected`;

  function toggle(id: string) {
    if (disabled) return;
    if (selectedIds.includes(id)) onChange(selectedIds.filter((item) => item !== id));
    else onChange([...selectedIds, id]);
  }

  if (options.length === 0) {
    return <p className="text-xs text-quiet">No catalogue SKUs available.</p>;
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-md">
      {label ? <p className="mb-1 text-xs text-quiet">{label}</p> : null}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-left text-xs text-ink hover:border-accent disabled:opacity-40"
      >
        <span className={selected.length === 0 ? "text-quiet" : "text-ink"}>{summary}</span>
        <span className="text-quiet" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-line bg-panel py-1 shadow-lg"
        >
          {options.map((sku) => {
            const checked = selectedIds.includes(sku.id);
            return (
              <li key={sku.id} role="option" aria-selected={checked}>
                <button
                  type="button"
                  disabled={disabled || sku.active === false}
                  onClick={() => toggle(sku.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-panel-2 disabled:opacity-40"
                >
                  <span
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                      checked ? "border-accent bg-accent text-accent-ink" : "border-line text-transparent"
                    }`}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink">{sku.name}</span>
                    <span className="ml-1 text-quiet">{sku.formFactor}</span>
                    {sku.active === false ? <span className="ml-1 text-danger">Deactivated</span> : null}
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
