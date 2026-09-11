import { ensureAuthSchema } from "@/lib/auth/schema";
import { getSession } from "@/lib/auth/session";
import { getOrCreatePortalContext, type PortalContext } from "@/lib/portal/repo";
import { ensurePortalSchema } from "@/lib/portal/schema";
import { redirect } from "next/navigation";

export async function requirePortal(): Promise<PortalContext> {
  const session = await getSession();
  if (!session) redirect("/");
  await ensureAuthSchema();
  await ensurePortalSchema();
  return getOrCreatePortalContext(session.email);
}
