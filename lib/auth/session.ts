import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { bytesToHex, fromBase64Url, timingSafeEqual, toBase64Url } from "@/lib/auth/crypto";

export const SESSION_COOKIE = "catalyst_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

export type Session = {
  email: string;
};

type TokenPayload = {
  email: string;
  exp: number;
};

function getSecret(): string {
  const secret = getEnv().AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured.");
  }
  return secret;
}

async function hmacSign(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToHex(sig);
}

export async function createSessionToken(session: Session): Promise<string> {
  const payload: TokenPayload = {
    email: session.email,
    exp: Date.now() + MAX_AGE_SEC * 1000,
  };
  const encoded = toBase64Url(JSON.stringify(payload));
  const signature = await hmacSign(encoded);
  return `${encoded}.${signature}`;
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = await hmacSign(encoded);
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(fromBase64Url(encoded)) as TokenPayload;
    if (!payload.email || payload.exp <= Date.now()) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(session: Session): Promise<void> {
  const token = await createSessionToken(session);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
