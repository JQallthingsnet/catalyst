import handler from "vinext/server/fetch-handler";
import { runScheduledCcPoll } from "@/lib/cc/devices";
import { ensurePortalSchema } from "@/lib/portal/schema";

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
  },
};
