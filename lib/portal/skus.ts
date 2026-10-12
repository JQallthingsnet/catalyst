import { getDB } from "@/lib/env";
import { newId } from "@/lib/portal/ids";

export type SimSku = {
  id: string;
  name: string;
  formFactor: string;
  tech: string;
  region: string;
  blurb: string;
  createdAt: string;
  active: boolean;
  /** Orders that reference this SKU (blocks hard delete). */
  orderCount: number;
};

function mapRow(row: {
  id: string;
  name: string;
  form_factor: string;
  tech: string;
  region: string;
  blurb: string;
  created_at: string;
  active?: number | null;
  order_count?: number | null;
}): SimSku {
  return {
    id: row.id,
    name: row.name,
    formFactor: row.form_factor,
    tech: row.tech,
    region: row.region,
    blurb: row.blurb,
    createdAt: row.created_at,
    active: row.active == null ? true : Boolean(row.active),
    orderCount: row.order_count ?? 0,
  };
}

function clean(input: {
  name?: string;
  formFactor?: string;
  tech?: string;
  region?: string;
  blurb?: string;
}) {
  const name = input.name?.trim() ?? "";
  const formFactor = input.formFactor?.trim() ?? "";
  const tech = input.tech?.trim() ?? "";
  const region = input.region?.trim() ?? "";
  const blurb = input.blurb?.trim() ?? "";
  if (name.length < 2) throw new Error("Enter a SKU name.");
  if (!formFactor) throw new Error("Enter a form factor.");
  if (!tech) throw new Error("Enter the radio technology.");
  if (!region) throw new Error("Enter a region or market.");
  return { name, formFactor, tech, region, blurb };
}

export function skuIsEsim(sku: Pick<SimSku, "formFactor">): boolean {
  return sku.formFactor.toLowerCase().includes("esim");
}

export async function listSimSkus(options?: { activeOnly?: boolean }): Promise<SimSku[]> {
  const activeOnly = Boolean(options?.activeOnly);
  try {
    const rows = await getDB()
      .prepare(
        activeOnly
          ? `SELECT id, name, form_factor, tech, region, blurb, created_at, IFNULL(active, 1) AS active,
                    (SELECT COUNT(*) FROM orders o WHERE o.sku_id = sim_skus.id) AS order_count
             FROM sim_skus
             WHERE IFNULL(active, 1) = 1
             ORDER BY name COLLATE NOCASE`
          : `SELECT id, name, form_factor, tech, region, blurb, created_at, IFNULL(active, 1) AS active,
                    (SELECT COUNT(*) FROM orders o WHERE o.sku_id = sim_skus.id) AS order_count
             FROM sim_skus
             ORDER BY IFNULL(active, 1) DESC, name COLLATE NOCASE`,
      )
      .all<{
        id: string;
        name: string;
        form_factor: string;
        tech: string;
        region: string;
        blurb: string;
        created_at: string;
        active: number;
        order_count: number;
      }>();
    return (rows.results ?? []).map(mapRow);
  } catch {
    const rows = await getDB()
      .prepare(
        `SELECT id, name, form_factor, tech, region, blurb, created_at,
                (SELECT COUNT(*) FROM orders o WHERE o.sku_id = sim_skus.id) AS order_count
         FROM sim_skus ORDER BY name COLLATE NOCASE`,
      )
      .all<{
        id: string;
        name: string;
        form_factor: string;
        tech: string;
        region: string;
        blurb: string;
        created_at: string;
        order_count: number;
      }>();
    return (rows.results ?? []).map((row) => mapRow({ ...row, active: 1 }));
  }
}

export async function getSimSku(id: string): Promise<SimSku | null> {
  try {
    const row = await getDB()
      .prepare(
        `SELECT id, name, form_factor, tech, region, blurb, created_at, IFNULL(active, 1) AS active,
                (SELECT COUNT(*) FROM orders o WHERE o.sku_id = sim_skus.id) AS order_count
         FROM sim_skus WHERE id = ?`,
      )
      .bind(id)
      .first<{
        id: string;
        name: string;
        form_factor: string;
        tech: string;
        region: string;
        blurb: string;
        created_at: string;
        active: number;
        order_count: number;
      }>();
    return row ? mapRow(row) : null;
  } catch {
    const row = await getDB()
      .prepare(
        `SELECT id, name, form_factor, tech, region, blurb, created_at,
                (SELECT COUNT(*) FROM orders o WHERE o.sku_id = sim_skus.id) AS order_count
         FROM sim_skus WHERE id = ?`,
      )
      .bind(id)
      .first<{
        id: string;
        name: string;
        form_factor: string;
        tech: string;
        region: string;
        blurb: string;
        created_at: string;
        order_count: number;
      }>();
    return row ? mapRow({ ...row, active: 1 }) : null;
  }
}

export async function createSimSku(input: {
  name?: string;
  formFactor?: string;
  tech?: string;
  region?: string;
  blurb?: string;
}): Promise<SimSku> {
  const fields = clean(input);
  const id = newId("sku");
  const createdAt = new Date().toISOString();
  try {
    await getDB()
      .prepare(
        `INSERT INTO sim_skus (id, name, form_factor, tech, region, blurb, created_at, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(id, fields.name, fields.formFactor, fields.tech, fields.region, fields.blurb, createdAt)
      .run();
  } catch {
    await getDB()
      .prepare(
        `INSERT INTO sim_skus (id, name, form_factor, tech, region, blurb, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, fields.name, fields.formFactor, fields.tech, fields.region, fields.blurb, createdAt)
      .run();
  }
  return { id, ...fields, createdAt, active: true, orderCount: 0 };
}

export async function updateSimSku(
  id: string,
  input: { name?: string; formFactor?: string; tech?: string; region?: string; blurb?: string },
): Promise<SimSku> {
  const existing = await getSimSku(id);
  if (!existing) throw new Error("Catalogue item not found.");
  const fields = clean(input);
  await getDB()
    .prepare(
      `UPDATE sim_skus SET name = ?, form_factor = ?, tech = ?, region = ?, blurb = ? WHERE id = ?`,
    )
    .bind(fields.name, fields.formFactor, fields.tech, fields.region, fields.blurb, id)
    .run();
  return { ...existing, ...fields };
}

export async function setSimSkuActive(id: string, active: boolean): Promise<SimSku> {
  const existing = await getSimSku(id);
  if (!existing) throw new Error("Catalogue item not found.");
  await getDB()
    .prepare("UPDATE sim_skus SET active = ? WHERE id = ?")
    .bind(active ? 1 : 0, id)
    .run();
  return { ...existing, active };
}

export async function deleteSimSku(id: string, confirmName?: string): Promise<void> {
  const existing = await getSimSku(id);
  if (!existing) throw new Error("Catalogue item not found.");
  if (existing.active) throw new Error("Deactivate the SKU first, then delete.");
  if (confirmName != null && confirmName.trim() !== existing.name) {
    throw new Error("Type the SKU name exactly to confirm delete.");
  }
  if (existing.orderCount > 0) {
    throw new Error("This SKU is used on an order. Keep it deactivated instead of deleting.");
  }
  const bound = await getDB()
    .prepare(
      `SELECT id FROM tenants WHERE cc_default_sku_id = ? LIMIT 1`,
    )
    .bind(id)
    .first();
  if (bound) {
    throw new Error("This SKU is the default for a bound reseller. Clear that bind before deleting.");
  }
  const db = getDB();
  await db.batch([
    db.prepare("DELETE FROM tenant_sku_assignments WHERE sku_id = ?").bind(id),
    db.prepare("DELETE FROM sim_skus WHERE id = ?").bind(id),
  ]);
}

export type ContractSkuLine = {
  skuId: string;
  name: string;
  formFactor: string;
  tech: string;
  region: string;
  active: boolean;
};

/** Catalogue SKUs bound on a reseller’s contract (Order SIMs allowlist). */
export async function listResellerSkus(tenantId: string): Promise<ContractSkuLine[]> {
  try {
    const rows = await getDB()
      .prepare(
        `SELECT s.id, s.name, s.form_factor, s.tech, s.region, IFNULL(s.active, 1) AS active
         FROM tenant_sku_assignments a
         JOIN sim_skus s ON s.id = a.sku_id
         WHERE a.tenant_id = ?
         ORDER BY IFNULL(s.active, 1) DESC, s.name COLLATE NOCASE`,
      )
      .bind(tenantId)
      .all<{
        id: string;
        name: string;
        form_factor: string;
        tech: string;
        region: string;
        active: number;
      }>();
    return (rows.results ?? []).map((row) => ({
      skuId: row.id,
      name: row.name,
      formFactor: row.form_factor,
      tech: row.tech,
      region: row.region,
      active: Boolean(row.active),
    }));
  } catch {
    return [];
  }
}

export async function listAllTenantSkuIds(): Promise<{ tenantId: string; skuId: string }[]> {
  try {
    const rows = await getDB()
      .prepare(`SELECT tenant_id, sku_id FROM tenant_sku_assignments`)
      .all<{ tenant_id: string; sku_id: string }>();
    return (rows.results ?? []).map((row) => ({
      tenantId: row.tenant_id,
      skuId: row.sku_id,
    }));
  } catch {
    return [];
  }
}

export async function tenantHasSku(tenantId: string, skuId: string): Promise<boolean> {
  try {
    const row = await getDB()
      .prepare(
        `SELECT 1 AS ok FROM tenant_sku_assignments WHERE tenant_id = ? AND sku_id = ? LIMIT 1`,
      )
      .bind(tenantId, skuId)
      .first<{ ok: number }>();
    return Boolean(row);
  } catch {
    return false;
  }
}

export async function assignSkuToTenant(tenantId: string, skuId: string): Promise<void> {
  const sku = await getSimSku(skuId);
  if (!sku) throw new Error("Catalogue item not found.");
  if (!sku.active) throw new Error("Reactivate this SKU before binding it on a contract.");
  const tenant = await getDB()
    .prepare(`SELECT id, IFNULL(active, 1) AS active FROM tenants WHERE id = ?`)
    .bind(tenantId)
    .first<{ id: string; active: number }>();
  if (!tenant) throw new Error("Organisation not found.");
  if (!tenant.active) throw new Error("That organisation is deactivated.");
  const now = new Date().toISOString();
  await getDB()
    .prepare(
      `INSERT INTO tenant_sku_assignments (tenant_id, sku_id, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(tenant_id, sku_id) DO NOTHING`,
    )
    .bind(tenantId, skuId, now)
    .run();
}

export async function unassignSkuFromTenant(tenantId: string, skuId: string): Promise<void> {
  await getDB()
    .prepare(`DELETE FROM tenant_sku_assignments WHERE tenant_id = ? AND sku_id = ?`)
    .bind(tenantId, skuId)
    .run();
}
