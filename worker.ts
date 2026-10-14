import handler from "vinext/server/fetch-handler";
import { runScheduledCcPoll } from "@/lib/cc/devices";
import { snapshotPoolCustomerDailyIfNeeded } from "@/lib/portal/pools";
import { ensurePortalSchema } from "@/lib/portal/schema";
import { notifySimAllowanceAlerts } from "@/lib/portal/sim-usage";

type VinextHandler = {
  fetch: (request: Request, env: unknown, ctx: ExecutionContext) => Response | Promise<Response>;
};

const vinext = handler as unknown as VinextHandler;

export default {
  fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    return vinext.fetch(request, env, ctx);
  },
  async scheduled() {
    await ensurePortalSchema();
    await runScheduledCcPoll();
    // Once per Sydney calendar day (first cron after local midnight): chart x-axis point.
    // Auto-poll also refreshes today's row when it runs.
    await snapshotPoolCustomerDailyIfNeeded();
    try {
      // Once per Sydney day: digest of SIMs ≥80% rate-plan allowance → jerry.qiu@allthingsnet.io
      await notifySimAllowanceAlerts();
    } catch (err) {
      console.error("[cron] sim allowance alerts failed", err);
    }
  },
};
