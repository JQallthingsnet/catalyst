import { NextResponse } from "next/server";
import {
  AUTH_CODE_LEN,
  AUTH_CODE_TTL_MS,
  authCodeExpiresAtIso,
  generateAuthCode,
  isValidEmail,
  normalizeEmail,
} from "@/lib/auth/codes";
import { sendVerificationEmail, getSmtpConfig } from "@/lib/auth/email";
import { AuthRateLimitBucket, checkRateLimit } from "@/lib/auth/rate-limit";
import { upsertAuthCode } from "@/lib/auth/repository";
import { getClientIP, isBrowserRequest } from "@/lib/auth/request";
import { isDevCodeEnabled } from "@/lib/env";

export async function POST(request: Request) {
  try {
    if (!isBrowserRequest(request)) {
      return NextResponse.json({ error: "This endpoint is only accessible from a browser." }, { status: 403 });
    }

    const body = (await request.json()) as { email?: string };
    const email = normalizeEmail(body.email ?? "");
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const emailLimit = await checkRateLimit({
      bucket: AuthRateLimitBucket.sendCodeEmail,
      identifier: email,
      maxAttempts: 3,
      windowMs: 5 * 60 * 1000,
    });
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: `Too many codes sent to this email. Try again in ${emailLimit.minutesLeft} minutes.` },
        { status: 429 },
      );
    }

    const ipLimit = await checkRateLimit({
      bucket: AuthRateLimitBucket.sendCodeIp,
      identifier: getClientIP(request),
      maxAttempts: 10,
      windowMs: 5 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${ipLimit.minutesLeft} minutes.` },
        { status: 429 },
      );
    }

    const code = generateAuthCode();
    const expiresAt = authCodeExpiresAtIso();
    await upsertAuthCode(email, code, expiresAt);

    const smtpReady = Boolean(getSmtpConfig());
    const allowDevCode = isDevCodeEnabled();

    if (smtpReady) {
      const sent = await sendVerificationEmail(email, code);
      if (!sent) {
        return NextResponse.json({ error: "Could not send the login code. Try again shortly." }, { status: 502 });
      }
    } else if (!allowDevCode) {
      return NextResponse.json(
        { error: "Email is not configured. Add the gmail-smtp-keys secret, or set AUTH_DEV_RETURN_CODE for local testing." },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      expiresAt,
      ttlSeconds: AUTH_CODE_TTL_MS / 1000,
      codeLength: AUTH_CODE_LEN,
      ...(allowDevCode ? { devCode: code } : {}),
    });
  } catch (err) {
    console.error("[send-code]", err);
    return NextResponse.json({ error: "Could not send the login code." }, { status: 500 });
  }
}
