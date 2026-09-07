export function isBrowserRequest(request: Request): boolean {
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua.trim()) return false;
  const lower = ua.toLowerCase();
  if (lower.includes("curl/") || lower.includes("python-requests") || lower.includes("httpie/")) {
    return false;
  }
  if (request.headers.get("sec-fetch-site") || request.headers.get("sec-fetch-mode")) {
    return true;
  }
  return Boolean(request.headers.get("origin") || request.headers.get("referer"));
}

export function getClientIP(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
