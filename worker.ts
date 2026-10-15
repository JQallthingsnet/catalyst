import handler from "vinext/server/fetch-handler";
import { runScheduledCcPoll } from "@/lib/cc/devices";
import { snapshotPoolCustomerDailyIfNeeded } from "@/lib/portal/pools";
import { ensurePortalSchema } from "@/lib/portal/schema";
import { notifySimAllowanceAlerts } from "@/lib/portal/sim-usage";

type VinextHandler = {
  fetch: (request: Request, env: unknown, ctx: ExecutionContext) => Response | Promise<Response>;
};

const vinext = handler as unknown as VinextHandler;

/** Near Sydney midnight (UTC). Digest is once-per-Sydney-day so both AEDT/AEST slots are safe. */
const USAGE_DIGEST_CRONS = new Set(["0 13 * * *", "0 14 * * *"]);
const CC_POLL_CRON = "0 * * * *";

export default {
  fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    return vinext.fetch(request, env, ctx);
  },

  async scheduled(controller: ScheduledController) {
    await ensurePortalSchema();
    const cron = controller.cron;

    if (USAGE_DIGEST_CRONS.has(cron)) {
      try {
        const alert = await notifySimAllowanceAlerts();
        console.log(
          "[cron:usage-digest]",
          cron,
          JSON.stringify({
            checked: alert.checked,
            newlyAlerted: alert.newlyAlerted,
            emailed: alert.emailed,
            day: alert.day,
            skipReason: alert.skipReason,
            error: alert.error,
          }),
        );
      } catch (err) {
        console.error("[cron:usage-digest] failed", cron, err);
      }
      return;
    }

    if (cron === CC_POLL_CRON) {
      try {
        await snapshotPoolCustomerDailyIfNeeded();
      } catch (err) {
        console.error("[cron:cc-poll] pool snapshot failed", err);
      }
      try {
        await runScheduledCcPoll();
      } catch (err) {
        console.error("[cron:cc-poll] failed", err);
      }
      return;
    }

    console.warn("[cron] unknown schedule", cron);
  },
};
