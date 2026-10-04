import { cache } from "react";
import { ensureAuthSchema } from "@/lib/auth/schema";
import { getSession } from "@/lib/auth/session";
import { resolvePortalContext } from "@/lib/portal/access";
import { can, type Privilege } from "@/lib/portal/roles";
import { ensurePortalSchema } from "@/lib/portal/schema";
import type { PortalContext } from "@/lib/portal/repo";
import { redirect } from "next/navigation";

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: string }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/** One portal resolve per RSC request (layout + page both call this). */
export const requirePortal = cache(async (): Promise<PortalContext> => {
  const session = await getSession();
  if (!session) redirect("/");
  await ensureAuthSchema();
  await ensurePortalSchema();
  try {
    return await resolvePortalContext(session.email);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    // Do not clear session cookies here — Server Components cannot mutate cookies on GET.
    redirect("/");
  }
});

export async function requirePrivilege(privilege: Privilege): Promise<PortalContext> {
  const ctx = await requirePortal();
  if (!can(ctx.role, privilege)) redirect("/dashboard");
  return ctx;
}
