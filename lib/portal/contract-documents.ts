import { getContractsBucket, getDB } from "@/lib/env";

export type ContractDocumentMeta = {
  tenantId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  r2Key: string;
};

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function getContractDocumentMeta(
  tenantId: string,
): Promise<ContractDocumentMeta | null> {
  const row = await getDB()
    .prepare(
      `SELECT tenant_id, r2_key, file_name, content_type, size_bytes, uploaded_at, uploaded_by
       FROM tenant_contract_documents WHERE tenant_id = ?`,
    )
    .bind(tenantId)
    .first<{
      tenant_id: string;
      r2_key: string;
      file_name: string;
      content_type: string;
      size_bytes: number;
      uploaded_at: string;
      uploaded_by: string;
    }>();
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    r2Key: row.r2_key,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
  };
}

export async function listContractDocumentMetaByTenants(
  tenantIds: string[],
): Promise<Map<string, ContractDocumentMeta>> {
  const map = new Map<string, ContractDocumentMeta>();
  if (tenantIds.length === 0) return map;
  // D1 has no great IN binding helper for arbitrary length — load all and filter.
  const rows = await getDB()
    .prepare(
      `SELECT tenant_id, r2_key, file_name, content_type, size_bytes, uploaded_at, uploaded_by
       FROM tenant_contract_documents`,
    )
    .all<{
      tenant_id: string;
      r2_key: string;
      file_name: string;
      content_type: string;
      size_bytes: number;
      uploaded_at: string;
      uploaded_by: string;
    }>();
  const want = new Set(tenantIds);
  for (const row of rows.results ?? []) {
    if (!want.has(row.tenant_id)) continue;
    map.set(row.tenant_id, {
      tenantId: row.tenant_id,
      r2Key: row.r2_key,
      fileName: row.file_name,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      uploadedAt: row.uploaded_at,
      uploadedBy: row.uploaded_by,
    });
  }
  return map;
}

export async function uploadContractDocument(input: {
  tenantId: string;
  actorEmail: string;
  fileName: string;
  contentType: string;
  bytes: ArrayBuffer;
}): Promise<ContractDocumentMeta> {
  const tenantId = input.tenantId.trim();
  if (!tenantId) throw new Error("Organisation is required.");
  const contentType = (input.contentType || "application/pdf").trim().toLowerCase();
  if (contentType !== "application/pdf" && !contentType.endsWith("/pdf")) {
    throw new Error("Upload a PDF file.");
  }
  if (input.bytes.byteLength < 1) throw new Error("The PDF file is empty.");
  if (input.bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error("PDF must be 10 MB or smaller.");
  }
  const fileName = (input.fileName.trim() || "contract.pdf").replace(/[^\w.\- ()]+/g, "_");
  const r2Key = `tenants/${tenantId}/signed-contract.pdf`;
  const uploadedAt = new Date().toISOString();
  const bucket = getContractsBucket();

  const existing = await getContractDocumentMeta(tenantId);
  await bucket.put(r2Key, input.bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: {
      tenantId,
      fileName,
      uploadedBy: input.actorEmail,
      uploadedAt,
    },
  });

  await getDB()
    .prepare(
      `INSERT INTO tenant_contract_documents
         (tenant_id, r2_key, file_name, content_type, size_bytes, uploaded_at, uploaded_by)
       VALUES (?, ?, ?, 'application/pdf', ?, ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET
         r2_key = excluded.r2_key,
         file_name = excluded.file_name,
         content_type = excluded.content_type,
         size_bytes = excluded.size_bytes,
         uploaded_at = excluded.uploaded_at,
         uploaded_by = excluded.uploaded_by`,
    )
    .bind(tenantId, r2Key, fileName, input.bytes.byteLength, uploadedAt, input.actorEmail)
    .run();

  // Old key was the same path; if a previous upload used a different key, drop it.
  if (existing?.r2Key && existing.r2Key !== r2Key) {
    await bucket.delete(existing.r2Key).catch(() => {});
  }

  return {
    tenantId,
    r2Key,
    fileName,
    contentType: "application/pdf",
    sizeBytes: input.bytes.byteLength,
    uploadedAt,
    uploadedBy: input.actorEmail,
  };
}

export async function readContractDocumentBytes(
  tenantId: string,
): Promise<{ meta: ContractDocumentMeta; bytes: ArrayBuffer; contentType: string } | null> {
  const meta = await getContractDocumentMeta(tenantId);
  if (!meta) return null;
  const object = await getContractsBucket().get(meta.r2Key);
  if (!object) return null;
  const bytes = await object.arrayBuffer();
  return {
    meta,
    bytes,
    contentType: object.httpMetadata?.contentType || meta.contentType || "application/pdf",
  };
}

export async function deleteContractDocument(tenantId: string): Promise<boolean> {
  const meta = await getContractDocumentMeta(tenantId);
  if (!meta) return false;
  await getContractsBucket().delete(meta.r2Key).catch(() => {});
  await getDB().prepare("DELETE FROM tenant_contract_documents WHERE tenant_id = ?").bind(tenantId).run();
  return true;
}
