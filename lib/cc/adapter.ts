import { getDB } from "@/lib/env";
import { newId } from "@/lib/portal/ids";

export type CcJobKind = "assign" | "lifecycle" | "order.accept" | "wholesale.allocate";

export type CcJob = {
  id: string;
  correlationId: string;
  kind: CcJobKind;
  status: "queued" | "applied" | "failed";
  error: string | null;
};

/**
 * Cisco IoT Control Center adapter.
 * v1 uses a sandbox stub: jobs are idempotent by correlation id and applied locally.
 * Do not call Catalyst Center or Webex Control Hub.
 */
export async function runCcMutation(input: {
  tenantId: string;
  kind: CcJobKind;
  payload: Record<string, unknown>;
  correlationId?: string;
}): Promise<CcJob> {
  const db = getDB();
  const correlationId = input.correlationId ?? newId("corr");
  const existing = await db
    .prepare("SELECT id, correlation_id, kind, status, error FROM cc_jobs WHERE correlation_id = ? AND tenant_id = ?")
    .bind(correlationId, input.tenantId)
    .first<{
      id: string;
      correlation_id: string;
      kind: CcJobKind;
      status: CcJob["status"];
      error: string | null;
    }>();

  if (existing) {
    return {
      id: existing.id,
      correlationId: existing.correlation_id,
      kind: existing.kind,
      status: existing.status,
      error: existing.error,
    };
  }

  const id = newId("job");
  const now = new Date().toISOString();
  const fail = Boolean(input.payload.forceFail);
  const status: CcJob["status"] = fail ? "failed" : "applied";
  const error = fail ? "Control Center returned HTTP 500. Retry the job; no silent split-brain." : null;

  await db
    .prepare(
      `INSERT INTO cc_jobs (id, tenant_id, correlation_id, kind, payload, status, error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.tenantId, correlationId, input.kind, JSON.stringify(input.payload), status, error, now, now)
    .run();

  return { id, correlationId, kind: input.kind, status, error };
}
