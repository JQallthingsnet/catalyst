import { env } from "cloudflare:workers";

export type AppEnv = {
  DB?: D1Database;
  AUTH_SECRET?: string;
  AUTH_DEV_RETURN_CODE?: string;
  "gmail-smtp-keys"?: string;
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
