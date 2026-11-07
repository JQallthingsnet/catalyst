import { WorkerMailer } from "worker-mailer";
import { getEnv } from "@/lib/env";
import type { PortalRole } from "@/lib/portal/role-model";
import { VIEW_ROLES } from "@/lib/portal/role-model";

const GMAIL_SECRET_NAME = "gmail-smtp-keys";
const RESEND_SECRET_NAME = "resend_api_key";
const DEFAULT_SMTP_HOST = "smtp.gmail.com";
const DEFAULT_SMTP_PORT = "465";
/** Verified Resend domain; override with Worker var RESEND_FROM if needed. */
const DEFAULT_RESEND_FROM = "ATN Catalyst <notifications@notify.allthingsnet.io>";

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

function readString(json: Record<string, unknown>, key: string): string | undefined {
  const value = json[key];
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function parseSmtpSecret(raw: unknown): SmtpConfig | null {
  if (!raw) return null;
  let json: Record<string, unknown>;
  try {
    json = typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : (raw as Record<string, unknown>);
    if (typeof json === "string") {
      json = JSON.parse(json) as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  const user = readString(json, "gmail-smtp-email");
  const pass = readString(json, "gmail-smtp-password");
  if (!user || !pass) return null;

  return {
    host: readString(json, "gmail-smtp-host") ?? DEFAULT_SMTP_HOST,
    port: Number(readString(json, "gmail-smtp-port") ?? DEFAULT_SMTP_PORT),
    user,
    pass,
    from: user,
  };
}

function getResendApiKey(): string | null {
  const raw = getEnv()[RESEND_SECRET_NAME];
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  return key.length > 0 ? key : null;
}

function getResendFrom(): string {
  const from = getEnv().RESEND_FROM?.trim();
  return from && from.length > 0 ? from : DEFAULT_RESEND_FROM;
}

export function getEmailConfig(): SmtpConfig | null {
  return parseSmtpSecret(getEnv()[GMAIL_SECRET_NAME]);
}

async function sendViaResend(to: string, subject: string, html: string, apiKey: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getResendFrom(),
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { message?: string; name?: string };
      if (body.message) detail = body.message;
      else if (body.name) detail = `${body.name}: ${detail}`;
    } catch {
      // keep status text
    }
    throw new Error(detail);
  }
}

async function sendViaSmtp(to: string, subject: string, html: string, smtp: SmtpConfig): Promise<void> {
  const implicitTls = smtp.port === 465;
  await WorkerMailer.send(
    {
      host: smtp.host,
      port: smtp.port,
      secure: implicitTls,
      startTls: !implicitTls,
      authType: "plain",
      credentials: {
        username: smtp.user,
        password: smtp.pass,
      },
    },
    {
      from: { name: "ATN Catalyst", email: smtp.from },
      to,
      subject,
      html,
    },
  );
}

export async function sendSystemEmail(to: string, subject: string, html: string): Promise<void> {
  const resendKey = getResendApiKey();
  if (resendKey) {
    try {
      await sendViaResend(to, subject, html, resendKey);
      return;
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown Resend error";
      console.error("[email] Resend send failed", detail);
      throw new Error(`Email send failed: ${detail}`);
    }
  }

  const smtp = getEmailConfig();
  if (!smtp) {
    throw new Error(
      "Email is not configured. Set Worker secret resend_api_key (preferred) or gmail-smtp-keys.",
    );
  }

  try {
    await sendViaSmtp(to, subject, html, smtp);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown SMTP error";
    console.error("[email] SMTP send failed", detail);
    throw new Error(`SMTP send failed: ${detail}`);
  }
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  await sendSystemEmail(
    to,
    "Your Catalyst login code",
    `
      <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #111827;">Your login code</h2>
        <p>Use this 8-digit code to sign in to Catalyst. It expires in 5 minutes.</p>
        <div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #111827;">${code}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px;">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  );
}

export async function sendInviteEmail(input: {
  to: string;
  role: PortalRole;
  invitedBy: string;
  tenantName: string;
  signInUrl: string;
}): Promise<void> {
  const roleLabel = VIEW_ROLES.find((item) => item.id === input.role)?.label ?? input.role;
  await sendSystemEmail(
    input.to,
    `You're invited to ATN Catalyst as ${roleLabel}`,
    `
      <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #111827;">You're invited to ATN Catalyst</h2>
        <p>${input.invitedBy} invited you as <strong>${roleLabel}</strong> for <strong>${input.tenantName}</strong>.</p>
        <p>Open the portal and sign in with this email. We will email you an 8-digit passcode.</p>
        <p style="margin: 24px 0;">
          <a href="${input.signInUrl}" style="background: #2EE6D6; color: #070B14; padding: 12px 18px; border-radius: 12px; text-decoration: none; font-weight: 600;">
            Sign in to Catalyst
          </a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">If you were not expecting this, you can ignore this email.</p>
      </div>
    `,
  );
}
