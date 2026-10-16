import { resetPortalColumnCache } from "@/lib/portal/d1-compat";

let ready = false;
let inflight: Promise<void> | null = null;

/**
 * Schema is owned by `migrations/*.sql` (Wrangler D1 migrations).
 * This only warms the in-memory ready flag + column cache — no ALTER/CREATE storm.
 * Apply new SQL with: `npx wrangler d1 migrations apply catalyst-db --remote` (or local).
 */
export async function ensurePortalSchema(): Promise<void> {
  if (ready) return;
  if (inflight) return inflight;

  inflight = (async () => {
    resetPortalColumnCache();
    ready = true;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
