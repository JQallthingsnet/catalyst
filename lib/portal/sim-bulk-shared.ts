/** Shared with client UI — keep free of server-only imports. */
export const BULK_SIM_CAP = 100;

export type BulkItemAction = "Activate" | "Deactivate" | "rate_plan";

/** @deprecated Job-level kind; prefer per-item BulkItemAction. Kept for status payloads. */
export type BulkJobKind = BulkItemAction | "mixed";

export type BulkJobStatus = {
  id: string;
  kind: BulkJobKind;
  platformPlanId: string | null;
  status: "queued" | "running" | "completed" | "failed";
  total: number;
  done: number;
  okCount: number;
  failedCount: number;
  actorEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type BulkJobItemInput = {
  iccid: string;
  action: BulkItemAction;
  platformPlanId?: string;
};
