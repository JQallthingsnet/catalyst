import { NextResponse } from "next/server";
import { probeJasperEnrichCall, type JasperProbeKind } from "@/lib/cc/client";
import { getDB } from "@/lib/env";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { ensurePortalSchema } from "@/lib/portal/schema";

/** Super admin: one raw Jasper enrich GET; returns exact HTTP status + body. */
export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.estate");
  if (denied) return denied;
  if (ctx.role !== "super_admin") {
    return NextResponse.json({ error: "Only super admin can probe Control Center." }, { status: 403 });
  }
  await ensurePortalSchema();

  const body = (await request.json().catch(() => ({}))) as {
    iccid?: string;
    kind?: JasperProbeKind;
  };
  const kind: JasperProbeKind =
    body.kind === "session" || body.kind === "details" || body.kind === "ctd" ? body.kind : "ctd";

  let iccid = body.iccid?.replace(/\s/g, "") ?? "";
  if (!iccid) {
    const row = await getDB()
      .prepare(
        `SELECT iccid FROM cc_devices
         WHERE details_polled_at IS NOT NULL
         ORDER BY polled_at ASC
         LIMIT 1`,
      )
      .first<{ iccid: string }>();
    iccid = row?.iccid ?? "";
  }
  if (!iccid) {
    return NextResponse.json({ error: "No ICCID in D1 to probe. Pass { iccid } or Sync first." }, { status: 400 });
  }

  try {
    const result = await probeJasperEnrichCall(iccid, kind);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Probe failed." },
      { status: 502 },
    );
  }
}
