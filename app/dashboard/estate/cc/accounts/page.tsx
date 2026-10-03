import Link from "next/link";
import { CcAccountsProbe } from "@/components/portal/cc-accounts-probe";
import { requirePrivilege } from "@/lib/portal/guard";

export default async function CcAccountsPage() {
  await requirePrivilege("platform.estate");

  return (
    <div>
      <Link href="/dashboard/estate/cc" className="text-sm text-quiet hover:text-accent">
        ← CC snapshot
      </Link>
      <div className="mt-4">
        <h1 className="text-3xl font-semibold">Control Center accounts</h1>
        <p className="mt-1 max-w-3xl text-sm text-quiet">
          Verify the API-only admin can reach Control Center, then list enterprise accounts under that user. Prefer
          operator <span className="font-mono text-xs">GET /accounts</span>; if that endpoint is missing, Catalyst
          samples recent devices and collects distinct <span className="font-mono text-xs">accountId</span> values.
          Device sync still uses a single <span className="font-mono text-xs">JASPER_ACCOUNT_ID</span>.
        </p>
      </div>

      <div className="mt-6">
        <CcAccountsProbe />
      </div>
    </div>
  );
}
