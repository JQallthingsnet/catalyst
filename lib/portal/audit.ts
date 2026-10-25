import { getDB } from "@/lib/env";
import { parseYmd, sydneyDayEndExclusiveIso, sydneyDayStartIso } from "@/lib/portal/time";

export type AuditLogRow = {
  id: string;
  tenantId: string;
  tenantName: string;
  actorEmail: string;
  action: string;
  detail: string;
  createdAt: string;
};

export type AuditLogFilter = {
  /** Hard scope — reseller admin always set to their tenant. */
  scopeTenantId?: string;
  /** Super admin org picker. */
  organisationId?: string;
  query?: string;
  action?: string;
  actorEmail?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type AuditLogFilterOptions = {
  organisations: { id: string; name: string }[];
  actions: string[];
  actorEmails: string[];
};

function clip(value: string | undefined, max = 120): string {
  return (value ?? "").trim().slice(0, max);
}

export function normalizeAuditLogFilter(input: AuditLogFilter = {}): AuditLogFilter {
  let dateFrom = parseYmd(input.dateFrom)?.key ?? "";
  let dateTo = parseYmd(input.dateTo)?.key ?? "";
  if (dateFrom && dateTo && dateFrom > dateTo) {
    const swap = dateFrom;
    dateFrom = dateTo;
    dateTo = swap;
  }
  return {
    scopeTenantId: clip(input.scopeTenantId, 64) || undefined,
    organisationId: clip(input.organisationId, 64) || undefined,
    query: clip(input.query),
    action: clip(input.action, 64),
    actorEmail: clip(input.actorEmail),
    dateFrom,
    dateTo,
  };
}

export function auditLogFilterActive(filter: AuditLogFilter): boolean {
  const n = normalizeAuditLogFilter(filter);
  return Boolean(n.organisationId || n.query || n.action || n.actorEmail || n.dateFrom || n.dateTo);
}

function auditWhere(filter: AuditLogFilter): { sql: string; binds: (string | number)[] } {
  const n = normalizeAuditLogFilter(filter);
  const clauses: string[] = [];
  const binds: (string | number)[] = [];

  if (n.scopeTenantId) {
    clauses.push("a.tenant_id = ?");
    binds.push(n.scopeTenantId);
  } else if (n.organisationId) {
    clauses.push("a.tenant_id = ?");
    binds.push(n.organisationId);
  }

  if (n.query) {
    const text = `%${n.query}%`;
    clauses.push(
      `(IFNULL(a.actor_email,'') LIKE ? OR IFNULL(a.action,'') LIKE ? OR IFNULL(a.detail,'') LIKE ? OR IFNULL(t.name,'') LIKE ?)`,
    );
    binds.push(text, text, text, text);
  }
  if (n.action) {
    clauses.push("a.action = ?");
    binds.push(n.action);
  }
  if (n.actorEmail) {
    clauses.push("a.actor_email = ?");
    binds.push(n.actorEmail);
  }
  if (n.dateFrom) {
    const start = sydneyDayStartIso(n.dateFrom);
    if (start) {
      clauses.push("a.created_at >= ?");
      binds.push(start);
    }
  }
  if (n.dateTo) {
    const end = sydneyDayEndExclusiveIso(n.dateTo);
    if (end) {
      clauses.push("a.created_at < ?");
      binds.push(end);
    }
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    binds,
  };
}

function mapRow(row: {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  actor_email: string;
  action: string;
  detail: string;
  created_at: string;
}): AuditLogRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name?.trim() || row.tenant_id,
    actorEmail: row.actor_email,
    action: row.action,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

export async function countAuditLogs(filter: AuditLogFilter = {}): Promise<number> {
  const { sql, binds } = auditWhere(filter);
  const row = await getDB()
    .prepare(
      `SELECT COUNT(*) AS c
       FROM audit_events a
       LEFT JOIN tenants t ON t.id = a.tenant_id
       ${sql}`,
    )
    .bind(...binds)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function listAuditLogs(
  filter: AuditLogFilter = {},
  limit = 50,
  offset = 0,
): Promise<AuditLogRow[]> {
  const { sql, binds } = auditWhere(filter);
  const rows = await getDB()
    .prepare(
      `SELECT a.id, a.tenant_id, t.name AS tenant_name, a.actor_email, a.action, a.detail, a.created_at
       FROM audit_events a
       LEFT JOIN tenants t ON t.id = a.tenant_id
       ${sql}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, Math.max(1, Math.min(200, limit)), Math.max(0, offset))
    .all<{
      id: string;
      tenant_id: string;
      tenant_name: string | null;
      actor_email: string;
      action: string;
      detail: string;
      created_at: string;
    }>();
  return (rows.results ?? []).map(mapRow);
}

export async function listAuditLogFilterOptions(input: {
  scopeTenantId?: string;
}): Promise<AuditLogFilterOptions> {
  const scope = clip(input.scopeTenantId, 64);
  const scopeSql = scope ? "WHERE a.tenant_id = ?" : "";
  const scopeBinds = scope ? [scope] : [];

  const [orgs, actions, actors] = await Promise.all([
    scope
      ? Promise.resolve({ results: [] as { id: string; name: string }[] })
      : getDB()
          .prepare(
            `SELECT DISTINCT t.id, t.name
             FROM audit_events a
             JOIN tenants t ON t.id = a.tenant_id
             ORDER BY t.name COLLATE NOCASE`,
          )
          .all<{ id: string; name: string }>(),
    getDB()
      .prepare(
        `SELECT DISTINCT a.action
         FROM audit_events a
         ${scopeSql}
         ORDER BY a.action COLLATE NOCASE`,
      )
      .bind(...scopeBinds)
      .all<{ action: string }>(),
    getDB()
      .prepare(
        `SELECT DISTINCT a.actor_email
         FROM audit_events a
         ${scopeSql}
         ORDER BY a.actor_email COLLATE NOCASE`,
      )
      .bind(...scopeBinds)
      .all<{ actor_email: string }>(),
  ]);

  return {
    organisations: (orgs.results ?? []).filter((row) => row.id),
    actions: (actions.results ?? []).map((row) => row.action).filter(Boolean),
    actorEmails: (actors.results ?? []).map((row) => row.actor_email).filter(Boolean),
  };
}

export function auditActionLabel(action: string): string {
  switch (action) {
    case "lifecycle":
      return "Lifecycle";
    case "lifecycle_request":
      return "Lifecycle request";
    case "order":
      return "Order";
    case "plan":
      return "Plan";
    case "pool":
      return "Pool";
    case "customer":
      return "Customer";
    case "invite":
      return "Invite";
    case "tenant":
      return "Organisation";
    case "wholesale":
      return "Sell stock";
    case "rate_plan":
      return "Rate plan";
    default:
      return action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const EXPORT_PAGE_SIZE = 500;

/** CSV for the current filtered Logs view (all matching rows, paged). */
export async function exportAuditLogsCsv(options: {
  filter?: AuditLogFilter;
  includeOrganisation: boolean;
}): Promise<string> {
  const filter = normalizeAuditLogFilter(options.filter ?? {});
  const headers = [
    "when",
    "actor",
    ...(options.includeOrganisation ? ["organisation"] : []),
    "action",
    "action_key",
    "detail",
  ];
  const lines = [headers.join(",")];
  let offset = 0;
  while (true) {
    const { sql, binds } = auditWhere(filter);
    const rows = await getDB()
      .prepare(
        `SELECT a.id, a.tenant_id, t.name AS tenant_name, a.actor_email, a.action, a.detail, a.created_at
         FROM audit_events a
         LEFT JOIN tenants t ON t.id = a.tenant_id
         ${sql}
         ORDER BY a.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...binds, EXPORT_PAGE_SIZE, offset)
      .all<{
        id: string;
        tenant_id: string;
        tenant_name: string | null;
        actor_email: string;
        action: string;
        detail: string;
        created_at: string;
      }>();
    const page = (rows.results ?? []).map(mapRow);
    if (page.length === 0) break;
    for (const row of page) {
      const cells = [
        row.createdAt,
        row.actorEmail,
        ...(options.includeOrganisation ? [row.tenantName] : []),
        auditActionLabel(row.action),
        row.action,
        row.detail,
      ];
      lines.push(cells.map(csvEscape).join(","));
    }
    offset += page.length;
    if (page.length < EXPORT_PAGE_SIZE) break;
  }
  return `${lines.join("\n")}\n`;
}
