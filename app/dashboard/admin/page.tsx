import { requirePortal } from "@/lib/portal/guard";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const ctx = await requirePortal();
  if (ctx.role !== "super_admin") redirect("/dashboard");
  return (
    <div>
      <h1 className="text-3xl font-semibold">Admin</h1>
      <p className="mt-2 text-sm text-quiet">ATN ops: resellers, catalogue, stock, CC mapping, audit. Phase 1 stub.</p>
    </div>
  );
}
