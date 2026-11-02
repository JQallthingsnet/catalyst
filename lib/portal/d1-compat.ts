import { getDB } from "@/lib/env";

const columnCache = new Map<string, boolean>();

export function resetPortalColumnCache(): void {
  columnCache.clear();
}

type PortalCompatTable =
  | "tenants"
  | "platform_plans"
  | "tenant_plan_assignments"
  | "rate_plan_allowances"
  | "modem_allowances";

/** Cached check for columns added after first deploy (D1 may lag until alters run). */
export async function portalTableHasColumn(table: PortalCompatTable, column: string): Promise<boolean> {
  const key = `${table}.${column}`;
  const cached = columnCache.get(key);
  if (cached !== undefined) return cached;

  const pragmaTable =
    table === "tenants"
      ? "tenants"
      : table === "platform_plans"
        ? "platform_plans"
        : table === "rate_plan_allowances"
          ? "rate_plan_allowances"
          : table === "modem_allowances"
            ? "modem_allowances"
            : "tenant_plan_assignments";

  const row = await getDB()
    .prepare(`SELECT name FROM pragma_table_info('${pragmaTable}') WHERE name = ? LIMIT 1`)
    .bind(column)
    .first<{ name: string }>();
  const exists = Boolean(row);
  columnCache.set(key, exists);
  return exists;
}
