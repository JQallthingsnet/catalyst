import { getDB } from "@/lib/env";

export const AuthRateLimitBucket = {
  sendCodeEmail: "send_code_email",
  sendCodeIp: "send_code_ip",
  verifyCodeEmail: "verify_code_email",
  verifyCodeIp: "verify_code_ip",
} as const;

export type RateLimitResult = {
  allowed: boolean;
  minutesLeft: number;
};

export async function checkRateLimit(opts: {
  bucket: string;
  identifier: string;
  maxAttempts: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const db = getDB();
  const now = Date.now();

  const row = await db
    .prepare("SELECT attempts, window_start FROM auth_rate_limits WHERE bucket = ? AND identifier = ?")
    .bind(opts.bucket, opts.identifier)
    .first<{ attempts: number; window_start: string }>();

  let attempts = 0;
  let windowStartMs = now;

  if (row) {
    windowStartMs = new Date(row.window_start).getTime();
    if (now - windowStartMs < opts.windowMs) {
      attempts = row.attempts;
    } else {
      attempts = 0;
      windowStartMs = now;
    }
  }

  const nextAttempts = attempts + 1;
  const allowed = nextAttempts <= opts.maxAttempts;
  const minutesLeft = Math.max(1, Math.ceil((windowStartMs + opts.windowMs - now) / 60_000));

  await db
    .prepare(
      `INSERT INTO auth_rate_limits (bucket, identifier, attempts, window_start)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(bucket, identifier) DO UPDATE SET
         attempts = excluded.attempts,
         window_start = excluded.window_start`,
    )
    .bind(opts.bucket, opts.identifier, allowed ? nextAttempts : attempts, new Date(windowStartMs).toISOString())
    .run();

  return { allowed, minutesLeft };
}
