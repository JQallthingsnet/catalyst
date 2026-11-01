/** SIMs inventory filters (query-string + listSims). */

export type SimsCtdOp = "gt" | "lt" | "eq" | "gte" | "lte";

export type SimsListFilter = {
  /** Search box: ICCID, IMSI, MSISDN, or customer name (LIKE). */
  q?: string;
  planId?: string;
  customer?: string;
  iccid?: string;
  imsi?: string;
  msisdn?: string;
  state?: string;
  ctdOp?: SimsCtdOp;
  ctdMb?: number;
};

const CTD_OPS: SimsCtdOp[] = ["gt", "lt", "eq", "gte", "lte"];

export function parseSimsCtdOp(raw: string | undefined | null): SimsCtdOp | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  return CTD_OPS.includes(value as SimsCtdOp) ? (value as SimsCtdOp) : undefined;
}

export function normalizeSimsListFilter(input: {
  q?: string;
  plan?: string;
  customer?: string;
  iccid?: string;
  imsi?: string;
  msisdn?: string;
  state?: string;
  ctdOp?: string;
  ctdMb?: string;
}): SimsListFilter {
  const ctdOp = parseSimsCtdOp(input.ctdOp);
  const ctdRaw = input.ctdMb?.trim() ?? "";
  const ctdMb = ctdRaw === "" ? undefined : Number(ctdRaw);
  return {
    q: input.q?.trim() || undefined,
    planId: input.plan?.trim() || undefined,
    customer: input.customer?.trim() || undefined,
    iccid: input.iccid?.trim() || undefined,
    imsi: input.imsi?.trim() || undefined,
    msisdn: input.msisdn?.trim() || undefined,
    state: input.state?.trim() || undefined,
    ctdOp: ctdOp && ctdMb != null && Number.isFinite(ctdMb) ? ctdOp : undefined,
    ctdMb: ctdOp && ctdMb != null && Number.isFinite(ctdMb) ? ctdMb : undefined,
  };
}

export function simsListFilterActive(filter: SimsListFilter): boolean {
  return Boolean(
    filter.q ||
      filter.planId ||
      filter.customer ||
      filter.iccid ||
      filter.imsi ||
      filter.msisdn ||
      filter.state ||
      (filter.ctdOp && filter.ctdMb != null),
  );
}

export function simsListFilterParams(filter: SimsListFilter): URLSearchParams {
  const sp = new URLSearchParams();
  if (filter.q) sp.set("q", filter.q);
  if (filter.planId) sp.set("plan", filter.planId);
  if (filter.customer) sp.set("customer", filter.customer);
  if (filter.iccid) sp.set("iccid", filter.iccid);
  if (filter.imsi) sp.set("imsi", filter.imsi);
  if (filter.msisdn) sp.set("msisdn", filter.msisdn);
  if (filter.state) sp.set("state", filter.state);
  if (filter.ctdOp && filter.ctdMb != null) {
    sp.set("ctdOp", filter.ctdOp);
    sp.set("ctdMb", String(filter.ctdMb));
  }
  return sp;
}

export const SIM_STATE_FILTER_OPTIONS = [
  "Ready",
  "Active",
  "Suspended",
  "Deactivated",
] as const;

export const SIM_CTD_OP_OPTIONS: { value: SimsCtdOp; label: string }[] = [
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "eq", label: "=" },
  { value: "lte", label: "≤" },
  { value: "lt", label: "<" },
];
