import { env } from "cloudflare:workers";

export type AppEnv = {
  DB?: D1Database;
  AUTH_SECRET?: string;
  AUTH_DEV_RETURN_CODE?: string;
  SUPER_ADMIN_EMAIL?: string;
  JASPER_ACCOUNT_NAME?: string;
  JASPER_API_KEY?: string;
  JASPER_ACCOUNT_ID?: string;
  JASPER_API_BASE?: string;
  CC_AUTO_POLL?: string;
  /** Preferred outbound mail. Worker secret: `npx wrangler secret put resend_api_key`. */
  resend_api_key?: string;
  /** Optional override. Default: `ATN Catalyst <notifications@notify.allthingsnet.io>`. */
  RESEND_FROM?: string;
  "gmail-smtp-keys"?: string | Record<string, unknown>;
};

export function getEnv(): AppEnv {
  return env as AppEnv;
}

export function getDB(): D1Database {
  const db = getEnv().DB;
  if (!db) {
    throw new Error("D1 binding DB is not configured.");
  }
  return db;
}

export function isDevCodeEnabled(): boolean {
  const flag = getEnv().AUTH_DEV_RETURN_CODE?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

/** Production default is on. Set CC_AUTO_POLL=false locally to keep Control Center quiet. */
export function isCcAutoPollEnabled(): boolean {
  const flag = getEnv().CC_AUTO_POLL?.trim().toLowerCase();
  if (!flag) return true;
  return flag !== "0" && flag !== "false" && flag !== "off";
}
