import Link from "next/link";

const SUPER_ADMIN_RULES = [
  "ICCID is the unique identifier across Catalyst and Jasper.",
  "Every SIM a reseller assigns to a customer must map to one contracted rate plan.",
  "Bulk sell stock uses that reseller’s default rate plan; it must match the Jasper TCode when SIMs are transferred.",
  "A reseller with no bound rate plans cannot receive or order SIMs.",
  "Only bound resellers can see and use a rate plan. Bind contracts here before selling stock.",
  "Before activation, a rate-plan change is allowed within contracted plans.",
  "After activation: rate-plan changes only until 24:00 on the 24th of the month (Sydney); after that, reject with “Changes will be effective next month”. One change per ICCID per month.",
  "Activated rate-plan changes are flagged when the Jasper/CC TCode does not match; billing notification until charging is automated.",
  "Plan changes lists every ICCID rate-plan change per reseller, with SIM status.",
];

const SUPER_ADMIN_COMING = [
  "Push rate-plan changes to Jasper when the API is upgraded (Catalyst policy already enforced in-portal).",
];

const RESELLER_ADMIN_RULES = [
  "ICCID is the unique identifier for every SIM.",
  "When you assign a SIM to a customer, it must use one of the rate plans on this contract.",
  "Bulk stock from ATN lands on your default rate plan (shown below).",
  "Create retail plans on Plans from your contracted rate plans before operators assign SIMs.",
  "Only ATN can add or remove rate plans on this contract. Contact ATN if you need a change.",
  "Before activation you may change an ICCID’s rate plan to another plan on this contract.",
  "After activation: rate-plan changes only until midnight on the 24th (Sydney), and only once per ICCID per month. After the cut-off: “Changes will be effective next month”.",
];

export function ContractRules({ variant }: { variant: "super_admin" | "reseller_admin" }) {
  const rules = variant === "super_admin" ? SUPER_ADMIN_RULES : RESELLER_ADMIN_RULES;

  return (
    <article className="mt-6 rounded-card border border-line bg-panel p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold text-ink">How this works</h2>
          <p className="mt-1 text-sm text-quiet">
            {variant === "super_admin"
              ? "Rules Catalyst enforces for reseller contracts and stock."
              : "What your organisation must follow when using rate plans with ATN."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/dashboard/sims/rate-plan-changes" className="text-accent">
            Plan changes
          </Link>
          <Link href="/dashboard/plans" className="text-accent">
            {variant === "super_admin" ? "Supplier mapping on Plans" : "Retail plans"}
          </Link>
        </div>
      </div>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-quiet">
        {rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>

      {variant === "super_admin" ? (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-ink">Coming next</h3>
          <p className="mt-1 text-xs text-quiet">Planned product rules — not enforced yet.</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-quiet">
            {SUPER_ADMIN_COMING.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
