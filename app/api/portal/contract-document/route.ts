import { NextResponse } from "next/server";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";
import {
  deleteContractDocument,
  getContractDocumentMeta,
  readContractDocumentBytes,
  uploadContractDocument,
} from "@/lib/portal/contract-documents";
import { writeAudit } from "@/lib/portal/repo";
import { loadTenant } from "@/lib/portal/tenant";

function canReadContractDoc(
  ctx: { role: string; isSuperAdmin: boolean; tenantId: string; homeTenantId: string },
  tenantId: string,
): boolean {
  if (ctx.isSuperAdmin && ctx.role === "super_admin") return true;
  if (ctx.role === "reseller_admin" && ctx.tenantId === tenantId && tenantId !== ctx.homeTenantId) {
    return true;
  }
  return false;
}

export async function GET(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;

  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId")?.trim() || ctx.tenantId;
  if (!canReadContractDoc(ctx, tenantId)) {
    return NextResponse.json({ error: "Not allowed to view this contract PDF." }, { status: 403 });
  }

  const download = url.searchParams.get("download") === "1";
  const metaOnly = url.searchParams.get("meta") === "1";

  try {
    if (metaOnly) {
      const meta = await getContractDocumentMeta(tenantId);
      return NextResponse.json({ meta });
    }
    const file = await readContractDocumentBytes(tenantId);
    if (!file) {
      return NextResponse.json({ error: "No signed contract uploaded yet." }, { status: 404 });
    }
    const disposition = download
      ? `attachment; filename="${file.meta.fileName.replace(/"/g, "")}"`
      : `inline; filename="${file.meta.fileName.replace(/"/g, "")}"`;
    return new NextResponse(file.bytes, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
        "Content-Length": String(file.bytes.byteLength),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load contract PDF." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.plan");
  if (denied) return denied;
  if (!ctx.isSuperAdmin || ctx.role !== "super_admin") {
    return NextResponse.json({ error: "Only a super admin can upload the signed contract." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const tenantId = String(form.get("tenantId") ?? "").trim();
    const file = form.get("file");
    if (!tenantId) {
      return NextResponse.json({ error: "Organisation is required." }, { status: 400 });
    }
    if (tenantId === ctx.homeTenantId) {
      return NextResponse.json({ error: "ATN Platform has no reseller contract PDF." }, { status: 400 });
    }
    const tenant = await loadTenant(tenantId);
    if (!tenant) return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a PDF file to upload." }, { status: 400 });
    }
    const bytes = await file.arrayBuffer();
    const meta = await uploadContractDocument({
      tenantId,
      actorEmail: ctx.email,
      fileName: file.name || "contract.pdf",
      contentType: file.type || "application/pdf",
      bytes,
    });
    await writeAudit(
      tenantId,
      ctx.email,
      "contract",
      `Uploaded signed contract PDF (${meta.fileName}, ${meta.sizeBytes} bytes)`,
    );
    return NextResponse.json({ success: true, meta });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "platform.plan");
  if (denied) return denied;
  if (!ctx.isSuperAdmin || ctx.role !== "super_admin") {
    return NextResponse.json({ error: "Only a super admin can remove the signed contract." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { tenantId?: string };
    const tenantId = body.tenantId?.trim() ?? "";
    if (!tenantId) {
      return NextResponse.json({ error: "Organisation is required." }, { status: 400 });
    }
    const removed = await deleteContractDocument(tenantId);
    if (removed) {
      await writeAudit(tenantId, ctx.email, "contract", "Removed signed contract PDF");
    }
    return NextResponse.json({ success: true, removed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Remove failed." },
      { status: 400 },
    );
  }
}
