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

export default {
  fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    return vinext.fetch(request, env, ctx);
  },

  async scheduled(controller: ScheduledController) {
    await ensurePortalSchema();
    const cron = controller.cron;

    // Dedicated digest triggers — do not run the long CC poll here.
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

    // Everything else is CC poll (`*/10 * * * *`, legacy schedules, etc.).
    // Exact-match-only used to no-op when Wrangler triggers lagged the Worker deploy.
    console.log("[cron:cc-poll] start", cron);
    try {
      await snapshotPoolCustomerDailyIfNeeded();
    } catch (err) {
      console.error("[cron:cc-poll] pool snapshot failed", err);
    }
    try {
      const result = await runScheduledCcPoll();
      console.log(
        "[cron:cc-poll] done",
        cron,
        result
          ? JSON.stringify({
              pages: result.pages,
              upserted: result.upserted,
              details: result.details,
              lastPage: result.lastPage,
            })
          : "skipped (auto poll off / busy / not configured)",
      );
    } catch (err) {
      console.error("[cron:cc-poll] failed", cron, err);
    }
  },
};
