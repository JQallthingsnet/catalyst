"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg rounded-card border border-line bg-panel p-8 text-center">
      <h1 className="text-xl font-semibold text-ink">This page couldn&apos;t load</h1>
      <p className="mt-2 text-sm text-quiet">
        A dashboard request failed on the server. Other areas may still work until you open a broken page again.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-canvas"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-full border border-line px-5 py-2.5 text-sm text-ink hover:border-accent"
        >
          Dashboard home
        </a>
        <a href="/" className="rounded-full border border-line px-5 py-2.5 text-sm text-ink hover:border-accent">
          Sign-in page
        </a>
      </div>
    </div>
  );
}
