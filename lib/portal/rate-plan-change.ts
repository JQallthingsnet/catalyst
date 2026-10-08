import { getDB } from "@/lib/env";
import { newId } from "@/lib/portal/ids";
import { loadPlatformPlanRecord, tenantHasPlatformPlan } from "@/lib/portal/platform-plans";
import { writeAudit } from "@/lib/portal/repo";
import type { SimState } from "@/lib/portal/catalogue";
import {
  isAfterActivatedRatePlanCutoff,
  parseYmd,
  sydneyDayEndExclusiveIso,
  sydneyDayStartIso,
  sydneyMonthUtcBounds,
} from "@/lib/portal/time";

/** Outbound supplier push queue state (Jasper write still on hold). */
export type RatePlanPushStatus = "pending" | "pushed" | "failed" | "skipped";

export type RatePlanChange = {
  id: string;
  tenantId: string;
  tenantName: string;
  iccid: string;
  fromPlatformPlanId: string | null;
  toPlatformPlanId: string;
  fromRatePlan: string | null;
  toRatePlan: string;
  simState: string;
  tcodeMismatch: boolean;
  actorEmail: string;
  createdAt: string;
  simStatus: SimState | null;
  pushStatus: RatePlanPushStatus;
  pushedAt: string | null;
  pushError: string | null;
};

export function normalizePushStatus(value: string | null | undefined): RatePlanPushStatus {
  if (value === "pushed" || value === "failed" || value === "skipped" || value === "pending") {
    return value;
  }
  return "pending";
}

export type RatePlanChangeResult = {
  iccid: string;
  fromRatePlan: string | null;
  toRatePlan: string;
  tcodeMismatch: boolean;
  clearedRetailPlan: boolean;
};

function isActivatedState(state: SimState): boolean {
  return state !== "Ready";
}

async function countChangesThisSydneyMonth(iccid: string, at = new Date()): Promise<number> {
  const { startIso, endExclusiveIso } = sydneyMonthUtcBounds(at);
  const row = await getDB()
    .prepare(
      `SELECT COUNT(*) AS c FROM sim_rate_plan_changes
       WHERE iccid = ? AND created_at >= ? AND created_at < ?`,
    )
    .bind(iccid, startIso, endExclusiveIso)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/**
 * Catalyst portal policy for ICCID rate-plan changes.
 * Records push_status=pending for the future Jasper write queue (push still on hold).
 * - Target must be on the reseller contract and active.
 * - Ready SIMs: change freely within contracted plans.
 * - After activation: only until 24:00 on the 24th (Sydney); one change per ICCID per Sydney month.
 */
export async function changeSimRatePlan(
  tenantId: string,
  actorEmail: string,
  input: { iccid: string; platformPlanId: string },
): Promise<RatePlanChangeResult> {
  const db = getDB();
  const iccid = input.iccid.replace(/\s/g, "");
  const platformPlanId = input.platformPlanId.trim();
  if (!iccid) throw new Error("ICCID is required.");
  if (!platformPlanId) throw new Error("Choose a rate plan.");

  const sim = await db
    .prepare(
      `SELECT id, state, platform_plan_id, wholesale_plan, plan_id
       FROM sims WHERE tenant_id = ? AND iccid = ?`,
    )
    .bind(tenantId, iccid)
    .first<{
      id: string;
      state: SimState;
      platform_plan_id: string | null;
      wholesale_plan: string | null;
      plan_id: string | null;
    }>();
  if (!sim) throw new Error("SIM not found in this organisation.");

  if (sim.platform_plan_id === platformPlanId) {
    throw new Error("This SIM is already on that rate plan.");
  }

  const allowed = await tenantHasPlatformPlan(tenantId, platformPlanId);
  if (!allowed) throw new Error("That rate plan is not on this reseller’s contract.");

  const target = await loadPlatformPlanRecord(platformPlanId);
  if (!target) throw new Error("Rate plan not found.");
  if (!target.active) throw new Error("That rate plan is deactivated.");

  const now = new Date();
  if (isActivatedState(sim.state)) {
    if (isAfterActivatedRatePlanCutoff(now)) {
      throw new Error("Changes will be effective next month");
    }
    const prior = await countChangesThisSydneyMonth(iccid, now);
    if (prior >= 1) {
      throw new Error("Only one rate-plan change per ICCID is allowed each month.");
    }
  }

  const cc = await db
    .prepare("SELECT rate_plan FROM cc_devices WHERE iccid = ?")
    .bind(iccid)
    .first<{ rate_plan: string | null }>();
  const ccRate = cc?.rate_plan?.trim() || null;
  const toRatePlan = target.cc_rate_plan;
  const tcodeMismatch = Boolean(ccRate && ccRate !== toRatePlan);

  let clearedRetailPlan = false;
  if (sim.plan_id) {
    const retail = await db
      .prepare("SELECT platform_plan_id FROM plans WHERE id = ? AND tenant_id = ?")
      .bind(sim.plan_id, tenantId)
      .first<{ platform_plan_id: string | null }>();
    if (retail?.platform_plan_id && retail.platform_plan_id !== platformPlanId) {
      await db
        .prepare("UPDATE sims SET plan_id = NULL WHERE id = ? AND tenant_id = ?")
        .bind(sim.id, tenantId)
        .run();
      clearedRetailPlan = true;
    }
  }

  await db
    .prepare(
      `UPDATE sims SET platform_plan_id = ?, wholesale_plan = ? WHERE id = ? AND tenant_id = ?`,
    )
    .bind(platformPlanId, toRatePlan, sim.id, tenantId)
    .run();

  const changeId = newId("rpc");
  const createdAt = now.toISOString();
  await db
    .prepare(
      `INSERT INTO sim_rate_plan_changes
        (id, tenant_id, iccid, from_platform_plan_id, to_platform_plan_id,
         from_rate_plan, to_rate_plan, sim_state, tcode_mismatch, actor_email, created_at,
         push_status, pushed_at, push_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL)`,
    )
    .bind(
      changeId,
      tenantId,
      iccid,
      sim.platform_plan_id,
      platformPlanId,
      sim.wholesale_plan,
      toRatePlan,
      sim.state,
      tcodeMismatch ? 1 : 0,
      actorEmail,
      createdAt,
    )
    .run();

  const mismatchNote = tcodeMismatch
    ? ` · Supplier rate-plan code mismatch vs snapshot (${ccRate}) — billing notification pending`
    : "";
  await writeAudit(
    tenantId,
    actorEmail,
    "rate_plan",
    `${iccid}: ${sim.wholesale_plan ?? "—"} → ${toRatePlan}${clearedRetailPlan ? " · retail plan cleared" : ""}${mismatchNote}`,
  );

  return {
    iccid,
    fromRatePlan: sim.wholesale_plan,
    toRatePlan,
    tcodeMismatch,
    clearedRetailPlan,
  };
}

export type RatePlanChangeFilter = {
  /** Hard scope for reseller users (always applied). */
  scopeTenantId?: string;
  /** Platform-only organisation pick (tenant id). */
  organisationId?: string;
  query?: string;
  fromRatePlan?: string;
  toRatePlan?: string;
  simState?: string;
  currentState?: string;
  supplierCode?: "ok" | "mismatch" | "";
  pushStatus?: RatePlanPushStatus | "";
  actorEmail?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type RatePlanChangeFilterOptions = {
  organisations: Array<{ id: string; name: string }>;
  fromRatePlans: string[];
  toRatePlans: string[];
  simStates: string[];
  currentStates: string[];
  actorEmails: string[];
};

type RatePlanChangeRow = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  iccid: string;
  from_platform_plan_id: string | null;
  to_platform_plan_id: string;
  from_rate_plan: string | null;
  to_rate_plan: string;
  sim_state: string;
  tcode_mismatch: number;
  actor_email: string;
  created_at: string;
  current_state: SimState | null;
  push_status: string | null;
  pushed_at: string | null;
  push_error: string | null;
};

const CHANGE_SELECT = `SELECT c.id, c.tenant_id, t.name AS tenant_name, c.iccid,
                  c.from_platform_plan_id, c.to_platform_plan_id,
                  c.from_rate_plan, c.to_rate_plan, c.sim_state, c.tcode_mismatch,
                  c.actor_email, c.created_at, s.state AS current_state,
                  c.push_status, c.pushed_at, c.push_error
           FROM sim_rate_plan_changes c
           JOIN tenants t ON t.id = c.tenant_id
           LEFT JOIN sims s ON s.iccid = c.iccid AND s.tenant_id = c.tenant_id`;

const EXPORT_PAGE_SIZE = 500;

function clipFilter(value: string | undefined, max = 120): string {
  return (value ?? "").trim().slice(0, max);
}

export function normalizeRatePlanChangeFilter(input: RatePlanChangeFilter = {}): RatePlanChangeFilter {
  const supplierCode = input.supplierCode === "ok" || input.supplierCode === "mismatch" ? input.supplierCode : "";
  const pushStatus =
    input.pushStatus === "pending" ||
    input.pushStatus === "pushed" ||
    input.pushStatus === "failed" ||
    input.pushStatus === "skipped"
      ? input.pushStatus
      : "";
  let dateFrom = parseYmd(input.dateFrom)?.key ?? "";
  let dateTo = parseYmd(input.dateTo)?.key ?? "";
  if (dateFrom && dateTo && dateFrom > dateTo) {
    const swap = dateFrom;
    dateFrom = dateTo;
    dateTo = swap;
  }
  return {
    scopeTenantId: clipFilter(input.scopeTenantId, 64) || undefined,
    organisationId: clipFilter(input.organisationId, 64) || undefined,
    query: clipFilter(input.query),
    fromRatePlan: clipFilter(input.fromRatePlan),
    toRatePlan: clipFilter(input.toRatePlan),
    simState: clipFilter(input.simState),
    currentState: clipFilter(input.currentState),
    supplierCode,
    pushStatus,
    actorEmail: clipFilter(input.actorEmail),
    dateFrom,
    dateTo,
  };
}

export function ratePlanChangeFilterActive(filter: RatePlanChangeFilter): boolean {
  const normalized = normalizeRatePlanChangeFilter(filter);
  return Boolean(
    normalized.organisationId ||
      normalized.query ||
      normalized.fromRatePlan ||
      normalized.toRatePlan ||
      normalized.simState ||
      normalized.currentState ||
      normalized.supplierCode ||
      normalized.pushStatus ||
      normalized.actorEmail ||
      normalized.dateFrom ||
      normalized.dateTo,
  );
}

function ratePlanChangeWhere(filter: RatePlanChangeFilter): { sql: string; binds: (string | number)[] } {
  const normalized = normalizeRatePlanChangeFilter(filter);
  const clauses: string[] = [];
  const binds: (string | number)[] = [];

  if (normalized.scopeTenantId) {
    clauses.push("c.tenant_id = ?");
    binds.push(normalized.scopeTenantId);
  } else if (normalized.organisationId) {
    clauses.push("c.tenant_id = ?");
    binds.push(normalized.organisationId);
  }

  if (normalized.query) {
    clauses.push(`(c.iccid LIKE ? OR IFNULL(c.actor_email,'') LIKE ? OR IFNULL(c.from_rate_plan,'') LIKE ?
      OR IFNULL(c.to_rate_plan,'') LIKE ? OR IFNULL(t.name,'') LIKE ?)`);
    const digits = `%${normalized.query.replace(/\s/g, "")}%`;
    const text = `%${normalized.query}%`;
    binds.push(digits, text, text, text, text);
  }
  if (normalized.fromRatePlan) {
    clauses.push("c.from_rate_plan = ?");
    binds.push(normalized.fromRatePlan);
  }
  if (normalized.toRatePlan) {
    clauses.push("c.to_rate_plan = ?");
    binds.push(normalized.toRatePlan);
  }
  if (normalized.simState) {
    clauses.push("c.sim_state = ?");
    binds.push(normalized.simState);
  }
  if (normalized.currentState) {
    clauses.push("s.state = ?");
    binds.push(normalized.currentState);
  }
  if (normalized.supplierCode === "ok") clauses.push("c.tcode_mismatch = 0");
  if (normalized.supplierCode === "mismatch") clauses.push("c.tcode_mismatch = 1");
  if (normalized.pushStatus) {
    clauses.push("IFNULL(c.push_status, 'pending') = ?");
    binds.push(normalized.pushStatus);
  }
  if (normalized.actorEmail) {
    clauses.push("c.actor_email = ?");
    binds.push(normalized.actorEmail);
  }
  if (normalized.dateFrom || normalized.dateTo) {
    const startIso = normalized.dateFrom ? sydneyDayStartIso(normalized.dateFrom) : null;
    const endExclusiveIso = normalized.dateTo ? sydneyDayEndExclusiveIso(normalized.dateTo) : null;
    const instant = `datetime(replace(substr(trim(c.created_at), 1, 19), 'T', ' '))`;
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

function mapRatePlanChange(row: RatePlanChangeRow): RatePlanChange {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    iccid: row.iccid,
    fromPlatformPlanId: row.from_platform_plan_id,
    toPlatformPlanId: row.to_platform_plan_id,
    fromRatePlan: row.from_rate_plan,
    toRatePlan: row.to_rate_plan,
    simState: row.sim_state,
    tcodeMismatch: Boolean(row.tcode_mismatch),
    actorEmail: row.actor_email,
    createdAt: row.created_at,
    simStatus: row.current_state,
    pushStatus: normalizePushStatus(row.push_status),
    pushedAt: row.pushed_at,
    pushError: row.push_error,
  };
}

export async function listRatePlanChanges(
  filter: RatePlanChangeFilter = {},
  limit = 50,
  offset = 0,
): Promise<RatePlanChange[]> {
  const { sql, binds } = ratePlanChangeWhere(filter);
  const safeLimit = Math.max(1, Math.min(limit, 1_000));
  const safeOffset = Math.max(0, offset);
  const rows = await getDB()
    .prepare(
      `${CHANGE_SELECT}${sql}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, safeLimit, safeOffset)
    .all<RatePlanChangeRow>();
  return (rows.results ?? []).map(mapRatePlanChange);
}

export async function countRatePlanChanges(filter: RatePlanChangeFilter = {}): Promise<number> {
  const { sql, binds } = ratePlanChangeWhere(filter);
  const row = await getDB()
    .prepare(
      `SELECT COUNT(*) AS c
       FROM sim_rate_plan_changes c
       JOIN tenants t ON t.id = c.tenant_id
       LEFT JOIN sims s ON s.iccid = c.iccid AND s.tenant_id = c.tenant_id${sql}`,
    )
    .bind(...binds)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function listRatePlanChangeFilterOptions(
  filter: Pick<RatePlanChangeFilter, "scopeTenantId"> = {},
): Promise<RatePlanChangeFilterOptions> {
  const scopeTenantId = clipFilter(filter.scopeTenantId, 64) || undefined;
  const scopeClause = scopeTenantId ? " WHERE c.tenant_id = ?" : "";
  const scopeBinds = scopeTenantId ? [scopeTenantId] : [];
  const db = getDB();

  async function distinct(columnSql: string): Promise<string[]> {
    const whereExtra = scopeClause
      ? `${scopeClause} AND ${columnSql} IS NOT NULL AND TRIM(CAST(${columnSql} AS TEXT)) != ''`
      : ` WHERE ${columnSql} IS NOT NULL AND TRIM(CAST(${columnSql} AS TEXT)) != ''`;
    const rows = await db
      .prepare(
        `SELECT DISTINCT ${columnSql} AS value
         FROM sim_rate_plan_changes c
         JOIN tenants t ON t.id = c.tenant_id
         LEFT JOIN sims s ON s.iccid = c.iccid AND s.tenant_id = c.tenant_id${whereExtra}
         ORDER BY value COLLATE NOCASE
         LIMIT 500`,
      )
      .bind(...scopeBinds)
      .all<{ value: string }>();
    return (rows.results ?? []).map((row) => String(row.value));
  }

  const orgRows = scopeTenantId
    ? { results: [] as Array<{ id: string; name: string }> }
    : await db
        .prepare(
          `SELECT DISTINCT t.id AS id, t.name AS name
           FROM sim_rate_plan_changes c
           JOIN tenants t ON t.id = c.tenant_id
           ORDER BY t.name COLLATE NOCASE
           LIMIT 500`,
        )
        .all<{ id: string; name: string }>();

  const [fromRatePlans, toRatePlans, simStates, currentStates, actorEmails] = await Promise.all([
    distinct("c.from_rate_plan"),
    distinct("c.to_rate_plan"),
    distinct("c.sim_state"),
    distinct("s.state"),
    distinct("c.actor_email"),
  ]);

  return {
    organisations: orgRows.results ?? [],
    fromRatePlans,
    toRatePlans,
    simStates,
    currentStates,
    actorEmails,
  };
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** CSV for the current filtered Plan changes view (all matching rows, paged). */
export async function exportRatePlanChangesCsv(options: {
  filter?: RatePlanChangeFilter;
  includeOrganisation: boolean;
}): Promise<string> {
  const filter = normalizeRatePlanChangeFilter(options.filter ?? {});
  const headers = options.includeOrganisation
    ? [
        "when",
        "organisation",
        "iccid",
        "from_rate_plan",
        "to_rate_plan",
        "state_at_change",
        "current_state",
        "supplier_code_match",
        "push_status",
        "pushed_at",
        "push_error",
        "changed_by",
      ]
    : [
        "when",
        "iccid",
        "from_rate_plan",
        "to_rate_plan",
        "state_at_change",
        "current_state",
        "supplier_code_match",
        "push_status",
        "pushed_at",
        "push_error",
        "changed_by",
      ];
  const lines = [headers.join(",")];
  let offset = 0;
  while (true) {
    const page = await listRatePlanChanges(filter, EXPORT_PAGE_SIZE, offset);
    if (page.length === 0) break;
    for (const row of page) {
      const cells = options.includeOrganisation
        ? [
            row.createdAt,
            row.tenantName,
            row.iccid,
            row.fromRatePlan,
            row.toRatePlan,
            row.simState,
            row.simStatus,
            row.tcodeMismatch ? "mismatch" : "ok",
            row.pushStatus,
            row.pushedAt,
            row.pushError,
            row.actorEmail,
          ]
        : [
            row.createdAt,
            row.iccid,
            row.fromRatePlan,
            row.toRatePlan,
            row.simState,
            row.simStatus,
            row.tcodeMismatch ? "mismatch" : "ok",
            row.pushStatus,
            row.pushedAt,
            row.pushError,
            row.actorEmail,
          ];
      lines.push(cells.map(csvEscape).join(","));
    }
    offset += page.length;
  }
  return `${lines.join("\n")}\n`;
}
