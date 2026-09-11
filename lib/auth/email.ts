import { WorkerMailer } from "worker-mailer";
import { getEnv } from "@/lib/env";
import type { PortalRole } from "@/lib/portal/role-model";
import { VIEW_ROLES } from "@/lib/portal/role-model";

const SECRET_NAME = "gmail-smtp-keys";
const DEFAULT_HOST = "smtp.gmail.com";
const DEFAULT_PORT = "465";

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
    host: readString(json, "gmail-smtp-host") ?? DEFAULT_HOST,
    port: Number(readString(json, "gmail-smtp-port") ?? DEFAULT_PORT),
    user,
    pass,
    from: user,
  };
}

export function getEmailConfig(): SmtpConfig | null {
  return parseSmtpSecret(getEnv()[SECRET_NAME]);
}

export async function sendSystemEmail(to: string, subject: string, html: string): Promise<void> {
  const smtp = getEmailConfig();
  if (!smtp) {
    throw new Error("gmail-smtp-keys is missing or does not contain gmail-smtp-email and gmail-smtp-password.");
  }

  const implicitTls = smtp.port === 465;
  try {
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
