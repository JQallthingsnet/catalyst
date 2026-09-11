import { getEnv } from "@/lib/env";

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

export function getSmtpConfig(): SmtpConfig | null {
  return parseSmtpSecret(getEnv()[SECRET_NAME]);
}

export async function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  const smtp = getSmtpConfig();
  if (!smtp) return false;

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    requireTLS: smtp.port === 587,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  await transporter.sendMail({
    from: `"Catalyst" <${smtp.from}>`,
    to,
    subject: "Your Catalyst login code",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #111827;">Your login code</h2>
        <p>Use this 8-digit code to sign in to Catalyst. It expires in 5 minutes.</p>
        <div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #111827;">${code}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px;">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });

  return true;
}
