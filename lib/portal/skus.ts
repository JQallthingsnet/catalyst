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
};

function mapRow(row: {
  id: string;
  name: string;
  form_factor: string;
  tech: string;
  region: string;
  blurb: string;
  created_at: string;
}): SimSku {
  return {
    id: row.id,
    name: row.name,
    formFactor: row.form_factor,
    tech: row.tech,
    region: row.region,
    blurb: row.blurb,
    createdAt: row.created_at,
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

export async function listSimSkus(): Promise<SimSku[]> {
  const rows = await getDB()
    .prepare(
      `SELECT id, name, form_factor, tech, region, blurb, created_at
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
    }>();
  return (rows.results ?? []).map(mapRow);
}

export async function getSimSku(id: string): Promise<SimSku | null> {
  const row = await getDB()
    .prepare(
      `SELECT id, name, form_factor, tech, region, blurb, created_at FROM sim_skus WHERE id = ?`,
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
    }>();
  return row ? mapRow(row) : null;
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
  await getDB()
    .prepare(
      `INSERT INTO sim_skus (id, name, form_factor, tech, region, blurb, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, fields.name, fields.formFactor, fields.tech, fields.region, fields.blurb, createdAt)
    .run();
  return { id, ...fields, createdAt };
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

export async function deleteSimSku(id: string): Promise<void> {
  const existing = await getSimSku(id);
  if (!existing) throw new Error("Catalogue item not found.");
  const used = await getDB()
    .prepare("SELECT id FROM orders WHERE sku_id = ? LIMIT 1")
    .bind(id)
    .first();
  if (used) throw new Error("This SKU is used on an order. Edit it instead of deleting.");
  await getDB().prepare("DELETE FROM sim_skus WHERE id = ?").bind(id).run();
}
