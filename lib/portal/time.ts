const SYDNEY = "Australia/Sydney";

const auDateTime = new Intl.DateTimeFormat("en-AU", {
  timeZone: SYDNEY,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const sydneyParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: SYDNEY,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatAuDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return String(value);
  return auDateTime.format(date);
}

/** Calendar Y/M/D in Australia/Sydney for policy windows. */
export function sydneyYmd(at: Date = new Date()): { year: number; month: number; day: number; key: string } {
  const parts = sydneyParts.formatToParts(at);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { year, month, day, key: `${year}-${String(month).padStart(2, "0")}` };
}

/**
 * Activated rate-plan changes are allowed through end of the 24th (Sydney).
 * From 25th 00:00 Sydney onward, reject.
 */
export function isAfterActivatedRatePlanCutoff(at: Date = new Date()): boolean {
  return sydneyYmd(at).day >= 25;
}

/** UTC ISO bounds covering the current Australia/Sydney calendar month (approx via day keys). */
export function sydneyMonthUtcBounds(at: Date = new Date()): { startIso: string; endExclusiveIso: string } {
  const { year, month } = sydneyYmd(at);
  const startIso = sydneyLocalToUtcIso(year, month, 1, 0, 0, 0);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endExclusiveIso = sydneyLocalToUtcIso(nextYear, nextMonth, 1, 0, 0, 0);
  return { startIso, endExclusiveIso };
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseYmd(value: string | undefined): { year: number; month: number; day: number; key: string } | null {
  const match = YMD.exec((value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day, key: `${match[1]}-${match[2]}-${match[3]}` };
}

/** Inclusive Sydney calendar day → UTC instant at 00:00 Sydney. */
export function sydneyDayStartIso(ymd: string): string | null {
  const parsed = parseYmd(ymd);
  if (!parsed) return null;
  return sydneyLocalToUtcIso(parsed.year, parsed.month, parsed.day, 0, 0, 0);
}

/** Exclusive UTC instant after the Sydney calendar day (next day 00:00). */
export function sydneyDayEndExclusiveIso(ymd: string): string | null {
  const parsed = parseYmd(ymd);
  if (!parsed) return null;
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1));
  return sydneyLocalToUtcIso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, 0);
}

/** Convert a Sydney wall-clock local time to a UTC ISO string (handles AEDT/AEST via shortOffset). */
function sydneyLocalToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string {
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: SYDNEY,
    timeZoneName: "shortOffset",
    year: "numeric",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  // e.g. "GMT+11" or "GMT+10:00"
  const match = offsetLabel?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const sign = match?.[1] === "-" ? -1 : 1;
  const offH = Number(match?.[2] ?? 10);
  const offM = Number(match?.[3] ?? 0);
  const offsetMinutes = sign * (offH * 60 + offM);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
  return new Date(utcMs).toISOString();
}
