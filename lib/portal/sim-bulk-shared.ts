/** Shared with client UI — keep free of server-only imports. */
export const BULK_SIM_CAP = 100;

/**
 * Per-item bulk action. Lifecycle uses an explicit Jasper status string
 * (e.g. ACTIVATED, TEST_READY). Legacy Activate/Deactivate still accepted server-side.
 */
export type BulkItemAction =
  | "Activate"
  | "Deactivate"
  | "rate_plan"
  | "retail_plan"
  | string;

/** @deprecated Job-level kind; prefer per-item BulkItemAction. Kept for status payloads. */
export type BulkJobKind = string;

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
  /** Target plan id: platform plan for rate_plan, retail plan for retail_plan. */
  platformPlanId?: string;
};
