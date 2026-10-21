export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/** Display ICCID with no spaces (digits only; strip any existing whitespace). */
export function formatIccid(iccid: string): string {
  return String(iccid ?? "").replace(/\s/g, "");
}

export function padIccid(n: number): string {
  return `89820244${String(n).padStart(4, "0")}`;
}
