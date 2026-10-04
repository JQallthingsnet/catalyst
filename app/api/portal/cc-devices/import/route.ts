import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import { ensurePortalSchema } from "@/lib/portal/schema";
import { importCcIccids } from "@/lib/cc/devices";
import { parseIccidsFromCsv } from "@/lib/cc/csv";

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.estate");
  if (denied) return denied;
  await ensurePortalSchema();

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let raw = "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (file instanceof File) {
        raw = await file.text();
      } else {
        raw = String(form.get("csv") ?? "");
      }
    } else if (contentType.includes("application/json")) {
      const body = (await request.json()) as { csv?: string; iccids?: string[] };
      if (Array.isArray(body.iccids) && body.iccids.length > 0) {
        const result = await importCcIccids(body.iccids);
        return NextResponse.json({ success: true, result });
      }
      raw = body.csv ?? "";
    } else {
      raw = await request.text();
    }

    const iccids = parseIccidsFromCsv(raw);
    if (iccids.length === 0) {
      return NextResponse.json(
        { error: "No valid ICCIDs found. Use a CSV with an iccid column (see sample)." },
        { status: 400 },
      );
    }
    const result = await importCcIccids(iccids);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed." }, { status: 400 });
  }
}
