import { NextResponse } from "next/server";
import { AUTH_CODE_LEN, isAuthCodeExpired, isValidEmail, normalizeAuthCode, normalizeEmail } from "@/lib/auth/codes";
import { AuthRateLimitBucket, checkRateLimit } from "@/lib/auth/rate-limit";
import {
  deleteAuthCode,
  getAuthCode,
  incrementAuthCodeAttempts,
  upsertUser,
} from "@/lib/auth/repository";
import { getClientIP, isBrowserRequest } from "@/lib/auth/request";
import { ensureAuthSchema } from "@/lib/auth/schema";
import { setSessionCookie } from "@/lib/auth/session";
import { timingSafeEqual } from "@/lib/auth/crypto";

export async function POST(request: Request) {
  try {
    if (!isBrowserRequest(request)) {
      return NextResponse.json({ error: "This endpoint is only accessible from a browser." }, { status: 403 });
    }

    const body = (await request.json()) as { email?: string; code?: string };
    const email = normalizeEmail(body.email ?? "");
    const code = normalizeAuthCode(body.code ?? "");

    if (!isValidEmail(email) || code.length !== AUTH_CODE_LEN) {
      return NextResponse.json({ error: "Enter your email and the 8-digit code." }, { status: 400 });
    }

    await ensureAuthSchema();

    const emailLimit = await checkRateLimit({
      bucket: AuthRateLimitBucket.verifyCodeEmail,
      identifier: email,
      maxAttempts: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${emailLimit.minutesLeft} minutes.` },
        { status: 429 },
      );
    }

    const ipLimit = await checkRateLimit({
      bucket: AuthRateLimitBucket.verifyCodeIp,
      identifier: getClientIP(request),
      maxAttempts: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${ipLimit.minutesLeft} minutes.` },
        { status: 429 },
      );
    }

    const row = await getAuthCode(email);
    if (!row) {
      return NextResponse.json({ error: "This code is invalid or has expired. Request a new one." }, { status: 400 });
    }

    if (isAuthCodeExpired(row.expires_at)) {
      await deleteAuthCode(email);
      return NextResponse.json({ error: "This code has expired. Request a new one." }, { status: 400 });
    }

    if (row.attempts >= 5) {
      await deleteAuthCode(email);
      return NextResponse.json({ error: "Too many incorrect codes. Request a new one." }, { status: 400 });
    }

    if (!timingSafeEqual(code, row.code)) {
      await incrementAuthCodeAttempts(email, row.attempts + 1);
      return NextResponse.json({ error: "That code is incorrect." }, { status: 400 });
    }

    await deleteAuthCode(email);
    const user = await upsertUser(email);
    await setSessionCookie({ email: user.email });

    return NextResponse.json({
      success: true,
      user: {
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (err) {
    console.error("[verify-code]", err);
    if (err instanceof Error && err.message.includes("AUTH_SECRET")) {
      return NextResponse.json({ error: "Login is not configured (missing AUTH_SECRET)." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not verify the code." }, { status: 500 });
  }
}
