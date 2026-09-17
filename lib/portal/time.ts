const AU_TIME: Intl.DateTimeFormatOptions = { timeZone: "Australia/Sydney" };

export function formatAuDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-AU", AU_TIME);
}
