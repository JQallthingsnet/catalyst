import type { ReactNode } from "react";

export function WizardFrame({
  title,
  steps,
  step,
  summary,
  children,
}: {
  title: string;
  steps: string[];
  step: number;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <ol className="mt-4 flex flex-wrap gap-2 text-sm">
        {steps.map((label, index) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 ${
              index === step ? "bg-accent text-canvas" : index < step ? "bg-panel-2 text-ok" : "bg-panel text-quiet"
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-card border border-line bg-panel p-5 lg:col-span-2">{children}</div>
        <aside className="rounded-card border border-line bg-panel p-5">
          <p className="text-sm font-semibold text-accent">Summary</p>
          <div className="mt-3 space-y-2 text-sm text-quiet">{summary}</div>
        </aside>
      </div>
    </div>
  );
}

export function WizardActions({
  onBack,
  onNext,
  nextLabel,
  busy,
  disabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="mt-6 flex gap-3">
      {onBack ? (
        <button type="button" onClick={onBack} className="rounded-card border border-line px-4 py-2.5 text-sm hover:border-accent">
          Back
        </button>
      ) : null}
      <button
        type="button"
        onClick={onNext}
        disabled={busy || disabled}
        className="rounded-card bg-accent px-4 py-2.5 text-sm font-medium text-canvas disabled:opacity-40"
      >
        {busy ? "Working…" : nextLabel}
      </button>
    </div>
  );
}
