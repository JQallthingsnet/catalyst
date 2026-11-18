import { getDB } from "@/lib/env";
import { newId } from "@/lib/portal/ids";
import { parseYmd, sydneyDayEndExclusiveIso, sydneyDayStartIso } from "@/lib/portal/time";

export type ImeiChange = {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  iccid: string;
  fromImei: string;
  toImei: string;
  customer: string | null;
  status: string | null;
  ratePlan: string | null;
  modemId: string | null;
  imsi: string | null;
  msisdn: string | null;
  source: string;
  detectedAt: string;
};

export type ImeiChangeFilter = {
  scopeTenantId?: string;
  organisationId?: string;
  query?: string;
  fromImei?: string;
  toImei?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type ImeiChangeFilterOptions = {
  organisations: Array<{ id: string; name: string }>;
  fromImeis: string[];
  toImeis: string[];
};

function clip(value: string | undefined, max = 120): string {
  return (value ?? "").trim().slice(0, max);
}

function normalizeImei(value: string | null | undefined): string {
  return (value ?? "").replace(/\s/g, "").trim();
}

/**
 * If CC reports a new non-empty IMEI that differs from the stored one, append a log row.
 * First-seen IMEI (empty → value) is not a change. CC snapshot row stays latest-only.
 */
export async function recordImeiChangeIfNeeded(input: {
  iccid: string;
  newImei: string | null | undefined;
  source?: string;
}): Promise<boolean> {
  const iccid = input.iccid.replace(/\s/g, "");
  const toImei = normalizeImei(input.newImei);
  if (!iccid || !toImei) return false;

  const db = getDB();
  const prior = await db
    .prepare(
      `SELECT imei, customer, status, rate_plan, modem_id, imsi, msisdn
       FROM cc_devices WHERE iccid = ?`,
    )
    .bind(iccid)
    .first<{
      imei: string | null;
      customer: string | null;
      status: string | null;
      rate_plan: string | null;
      modem_id: string | null;
      imsi: string | null;
      msisdn: string | null;
    }>();
  if (!prior) return false;

  const fromImei = normalizeImei(prior.imei);
  if (!fromImei || fromImei === toImei) return false;

  const sim = await db
    .prepare(`SELECT tenant_id FROM sims WHERE iccid = ? LIMIT 1`)
    .bind(iccid)
    .first<{ tenant_id: string }>();

  const detectedAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO sim_imei_changes
         (id, tenant_id, iccid, from_imei, to_imei, customer, status, rate_plan, modem_id,
          imsi, msisdn, source, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId("imei"),
      sim?.tenant_id ?? null,
      iccid,
      fromImei,
      toImei,
      prior.customer?.trim() || null,
      prior.status?.trim() || null,
      prior.rate_plan?.trim() || null,
      prior.modem_id?.trim() || null,
      prior.imsi?.trim() || null,
      prior.msisdn?.trim() || null,
      input.source?.trim() || "cc_poll",
      detectedAt,
    )
    .run();
  return true;
}

export function normalizeImeiChangeFilter(input: ImeiChangeFilter = {}): ImeiChangeFilter {
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
    fromImei: clip(input.fromImei, 32),
    toImei: clip(input.toImei, 32),
    dateFrom,
    dateTo,
  };
}

export function imeiChangeFilterActive(filter: ImeiChangeFilter): boolean {
  const n = normalizeImeiChangeFilter(filter);
  return Boolean(n.organisationId || n.query || n.fromImei || n.toImei || n.dateFrom || n.dateTo);
}

const CHANGE_FROM = `FROM sim_imei_changes c
           LEFT JOIN tenants t ON t.id = c.tenant_id`;

const CHANGE_SELECT = `SELECT c.id, c.tenant_id, t.name AS tenant_name, c.iccid,
                  c.from_imei, c.to_imei, c.customer, c.status, c.rate_plan, c.modem_id,
                  c.imsi, c.msisdn, c.source, c.detected_at
           ${CHANGE_FROM}`;

function imeiChangeWhere(filter: ImeiChangeFilter): { sql: string; binds: (string | number)[] } {
  const n = normalizeImeiChangeFilter(filter);
  const clauses: string[] = [];
  const binds: (string | number)[] = [];

  if (n.scopeTenantId) {
    clauses.push("c.tenant_id = ?");
    binds.push(n.scopeTenantId);
  } else if (n.organisationId) {
    clauses.push("c.tenant_id = ?");
    binds.push(n.organisationId);
  }

  if (n.query) {
    clauses.push(
      `(c.iccid LIKE ? OR IFNULL(c.from_imei,'') LIKE ? OR IFNULL(c.to_imei,'') LIKE ?
        OR IFNULL(c.customer,'') LIKE ? OR IFNULL(c.modem_id,'') LIKE ?
        OR IFNULL(t.name,'') LIKE ? OR IFNULL(c.imsi,'') LIKE ? OR IFNULL(c.msisdn,'') LIKE ?)`,
    );
    const digits = `%${n.query.replace(/\s/g, "")}%`;
    const text = `%${n.query}%`;
    binds.push(digits, digits, digits, text, text, text, digits, digits);
  }
  if (n.fromImei) {
    clauses.push("c.from_imei = ?");
    binds.push(n.fromImei);
  }
  if (n.toImei) {
    clauses.push("c.to_imei = ?");
    binds.push(n.toImei);
  }
  if (n.dateFrom || n.dateTo) {
    const startIso = n.dateFrom ? sydneyDayStartIso(n.dateFrom) : null;
    const endExclusiveIso = n.dateTo ? sydneyDayEndExclusiveIso(n.dateTo) : null;
    const instant = `datetime(replace(substr(trim(c.detected_at), 1, 19), 'T', ' '))`;
    if (startIso) {
      clauses.push(`${instant} >= datetime(?)`);
      binds.push(startIso.slice(0, 19).replace("T", " "));
    }
    if (endExclusiveIso) {
      clauses.push(`${instant} < datetime(?)`);
      binds.push(endExclusiveIso.slice(0, 19).replace("T", " "));
    }
  }

  return {
    sql: clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "",
    binds,
  };
}

function mapRow(row: {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  iccid: string;
  from_imei: string;
  to_imei: string;
  customer: string | null;
  status: string | null;
  rate_plan: string | null;
  modem_id: string | null;
  imsi: string | null;
  msisdn: string | null;
  source: string;
  detected_at: string;
}): ImeiChange {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    iccid: row.iccid,
    fromImei: row.from_imei,
    toImei: row.to_imei,
    customer: row.customer,
    status: row.status,
    ratePlan: row.rate_plan,
    modemId: row.modem_id,
    imsi: row.imsi,
    msisdn: row.msisdn,
    source: row.source,
    detectedAt: row.detected_at,
  };
}

export async function listImeiChanges(
  filter: ImeiChangeFilter = {},
  limit = 50,
  offset = 0,
): Promise<ImeiChange[]> {
  const { sql, binds } = imeiChangeWhere(filter);
  const rows = await getDB()
    .prepare(
      `${CHANGE_SELECT}${sql}
       ORDER BY c.detected_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, Math.max(1, Math.min(limit, 1_000)), Math.max(0, offset))
    .all<Parameters<typeof mapRow>[0]>();
  return (rows.results ?? []).map(mapRow);
}

export async function countImeiChanges(filter: ImeiChangeFilter = {}): Promise<number> {
  const { sql, binds } = imeiChangeWhere(filter);
  const row = await getDB()
    .prepare(`SELECT COUNT(*) AS c ${CHANGE_FROM}${sql}`)
    .bind(...binds)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function listImeiChangeFilterOptions(
  filter: ImeiChangeFilter = {},
): Promise<ImeiChangeFilterOptions> {
  const normalized = normalizeImeiChangeFilter(filter);
  const db = getDB();

  async function distinct(column: string, omit: keyof ImeiChangeFilter): Promise<string[]> {
    const scope = { ...normalized, [omit]: undefined };
    const { sql, binds } = imeiChangeWhere(scope);
    const whereExtra = sql
      ? `${sql} AND ${column} IS NOT NULL AND TRIM(${column}) != ''`
      : ` WHERE ${column} IS NOT NULL AND TRIM(${column}) != ''`;
    const rows = await db
      .prepare(
        `SELECT DISTINCT ${column} AS value
         ${CHANGE_FROM}${whereExtra}
         ORDER BY value COLLATE NOCASE
         LIMIT 500`,
      )
      .bind(...binds)
      .all<{ value: string }>();
    return (rows.results ?? []).map((row) => String(row.value));
  }

  const orgScope = { ...normalized, organisationId: undefined };
  const { sql: orgSql, binds: orgBinds } = imeiChangeWhere(orgScope);
  const orgWhere = orgSql
    ? `${orgSql} AND c.tenant_id IS NOT NULL AND TRIM(IFNULL(t.name,'')) != ''`
    : ` WHERE c.tenant_id IS NOT NULL AND TRIM(IFNULL(t.name,'')) != ''`;
  const orgRows = normalized.scopeTenantId
    ? { results: [] as Array<{ id: string; name: string }> }
    : await db
        .prepare(
          `SELECT DISTINCT t.id AS id, t.name AS name
           ${CHANGE_FROM}${orgWhere}
           ORDER BY t.name COLLATE NOCASE
           LIMIT 500`,
        )
        .bind(...orgBinds)
        .all<{ id: string; name: string }>();

  const [fromImeis, toImeis] = await Promise.all([
    distinct("c.from_imei", "fromImei"),
    distinct("c.to_imei", "toImei"),
  ]);

  return {
    organisations: orgRows.results ?? [],
    fromImeis,
    toImeis,
  };
}

const EXPORT_PAGE_SIZE = 500;

export async function exportImeiChangesCsv(options: {
  filter?: ImeiChangeFilter;
  includeOrganisation: boolean;
}): Promise<string> {
  const filter = normalizeImeiChangeFilter(options.filter ?? {});
  const header = [
    "when",
    ...(options.includeOrganisation ? ["organisation"] : []),
    "iccid",
    "from_imei",
    "to_imei",
    "customer",
    "status",
    "rate_plan",
    "modem_id",
    "imsi",
    "msisdn",
    "source",
  ];
  const lines = [header.join(",")];
  let offset = 0;
  while (true) {
    const page = await listImeiChanges(filter, EXPORT_PAGE_SIZE, offset);
    if (page.length === 0) break;
    for (const row of page) {
      const cells = [
        row.detectedAt,
        ...(options.includeOrganisation ? [row.tenantName ?? ""] : []),
        row.iccid,
        row.fromImei,
        row.toImei,
        row.customer ?? "",
        row.status ?? "",
        row.ratePlan ?? "",
        row.modemId ?? "",
        row.imsi ?? "",
        row.msisdn ?? "",
        row.source,
      ];
      lines.push(
        cells
          .map((cell) => {
            const text = String(cell);
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
          })
          .join(","),
      );
    }
    offset += page.length;
    if (page.length < EXPORT_PAGE_SIZE) break;
  }
  return `${lines.join("\n")}\n`;
}
