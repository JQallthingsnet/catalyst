/** Shared with client UI — keep free of server-only imports. */
export const BULK_SIM_CAP = 100;

export type BulkJobKind = "Activate" | "Deactivate" | "rate_plan";

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
