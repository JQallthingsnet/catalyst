export const AUTH_CODE_LEN = 8;
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
export const AUTH_CODE_EXPIRY_GRACE_MS = 3_000;

export function generateAuthCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 100_000_000).padStart(AUTH_CODE_LEN, "0");
}

export function normalizeAuthCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, AUTH_CODE_LEN);
}

export function authCodeExpiresAtIso(nowMs = Date.now()): string {
  return new Date(nowMs + AUTH_CODE_TTL_MS).toISOString();
}

export function isAuthCodeExpired(expiresAt: string, nowMs = Date.now()): boolean {
  const expMs = Date.parse(expiresAt);
  if (Number.isNaN(expMs)) return true;
  return nowMs > expMs + AUTH_CODE_EXPIRY_GRACE_MS;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
