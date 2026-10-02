import { getDB } from "@/lib/env";

const columnCache = new Map<string, boolean>();

export function resetPortalColumnCache(): void {
  columnCache.clear();
}

/** Cached check for columns added after first deploy (D1 may lag until alters run). */
export async function portalTableHasColumn(table: "tenants" | "platform_plans" | "tenant_plan_assignments", column: string): Promise<boolean> {
  const key = `${table}.${column}`;
  const cached = columnCache.get(key);
  if (cached !== undefined) return cached;

  const sql =
    table === "tenants"
      ? `SELECT name FROM pragma_table_info('tenants') WHERE name = ? LIMIT 1`
      : table === "platform_plans"
        ? `SELECT name FROM pragma_table_info('platform_plans') WHERE name = ? LIMIT 1`
        : `SELECT name FROM pragma_table_info('tenant_plan_assignments') WHERE name = ? LIMIT 1`;

  const row = await getDB().prepare(sql).bind(column).first<{ name: string }>();
  const exists = Boolean(row);
  columnCache.set(key, exists);
  return exists;
}
