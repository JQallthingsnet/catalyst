import { NextResponse } from "next/server";
import {
  getAlertSettingsForScope,
  PLATFORM_ALERT_SCOPE,
  saveAlertSetting,
  type AlertKind,
} from "@/lib/portal/alert-settings";
import { denyUnless, isResponse, requirePortalApi } from "@/lib/portal/api";

function scopeFor(ctx: { role: string; tenantId: string }): string {
  return ctx.role === "super_admin" ? PLATFORM_ALERT_SCOPE : ctx.tenantId;
}

function kindsFor(role: string): AlertKind[] {
  return role === "super_admin" ? ["pool"] : ["pool", "usage"];
}

export async function GET() {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "alerts.manage");
  if (denied) return denied;

  const scopeId = scopeFor(ctx);
  const kinds = kindsFor(ctx.role);
  const settings = await getAlertSettingsForScope(scopeId, kinds);
  return NextResponse.json({
    scopeId,
    kinds,
    settings,
  });
}

export async function PUT(request: Request) {
  const ctx = await requirePortalApi();
  if (isResponse(ctx)) return ctx;
  const denied = denyUnless(ctx, "alerts.manage");
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    thresholdPct?: number | null;
    recipients?: string | string[];
  };
  const kind = body.kind === "usage" ? "usage" : body.kind === "pool" ? "pool" : null;
  if (!kind) {
    return NextResponse.json({ error: "kind must be pool or usage." }, { status: 400 });
  }
  if (ctx.role === "super_admin" && kind !== "pool") {
    return NextResponse.json(
      { error: "Super admin configures Pool usage alerts only." },
      { status: 400 },
    );
  }

  try {
    const saved = await saveAlertSetting({
      scopeId: scopeFor(ctx),
      kind,
      thresholdPct: body.thresholdPct ?? null,
      recipients: body.recipients ?? [],
      updatedBy: ctx.email,
    });
    return NextResponse.json({ setting: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save alert settings." },
      { status: 400 },
    );
  }
}
