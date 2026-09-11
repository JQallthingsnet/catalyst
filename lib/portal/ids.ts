export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function formatIccid(iccid: string): string {
  return iccid.replace(/(.{4})/g, "$1 ").trim();
}

export function padIccid(n: number): string {
  return `89820244${String(n).padStart(4, "0")}`;
}
