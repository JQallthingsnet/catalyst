import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { CC_IMPORT_SAMPLE_CSV } from "@/lib/cc/csv";

export async function GET() {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.estate");
  if (denied) return denied;
  return new Response(CC_IMPORT_SAMPLE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cc-iccid-import-sample.csv"',
      "Cache-Control": "no-store",
    },
  });
}
