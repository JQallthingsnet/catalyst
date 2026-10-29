import Link from "next/link";

const SUPER_ADMIN_RULES = [
  "ICCID is the unique identifier across Catalyst and every supplier feed.",
  "Every SIM a reseller assigns to a customer must map to one contracted rate plan.",
  "Sell stock (ATN → reseller): set Customer on SIMs in Jasper first, Sync into the CC snapshot, then sell stock binds that Customer name to the reseller organisation once. Catalyst brings matching SIMs into that org’s inventory; later Sync adds new SIMs for the same Customer. Only that organisation can see and act on them.",
  "Assign SIMs (reseller → end customer) is separate: operators attach an org ICCID to a portal end customer and any retail plan on contract. If the SIM’s Reseller Plan differs, Assign applies the same Plan changes rules. Physical shipping is outside Catalyst.",
  "Rate plans: only bound resellers can see and use a rate plan. Bind them on Contract before selling stock.",
  "Catalogue: on Contract, tick which Catalogue SKUs each reseller may Order SIMs for (multiple allowed). Binding a rate plan requires at least one catalogue SKU if none are bound yet.",
  "Unbind rate plans before removing the last catalogue SKU from a reseller’s contract.",
  "Ready or Deactivated: rate-plan changes are free within contracted plans. Reseller admins or operators can change before shipping or after deactivation.",
  "Active or Suspended: rate-plan changes only until 24:00 on the 24th of the month (Sydney); after that, reject with “Changes will be effective next month”. One change per ICCID per month.",
  "Plan changes update the Reseller Plan. ATN bills from that Catalyst plan — not from Jasper. Whether to also change Jasper is ATN’s choice later.",
  "Snapshot differs / Push are super-admin only (CC vs Catalyst). They do not change reseller billing.",
  "Plan changes is the log book: super admin sees all resellers (with Organisation); reseller admin sees only their own ICCIDs.",
];

const SUPER_ADMIN_COMING = [
  "Optional: push a queued rate-plan change to Optus Control Center when ATN chooses to. Push status already exists (pending / pushed / failed / skipped).",
];

const RESELLER_ADMIN_RULES = [
  "ICCID is the unique identifier for every SIM.",
  "When you assign a SIM to a customer, it must use one of the rate plans on this contract.",
  "Sell stock from ATN binds your organisation to one Control Center Customer name. All SIMs with that Customer become yours in Catalyst (Sync keeps adding new ones). You only see and manage SIMs in your organisation.",
  "Assign SIMs maps your ICCIDs to end customers and any retail plan on this contract. If a SIM is still on the sell-stock default Reseller Plan, Assign can move it to the retail plan’s parent (same Plan changes rules). Shipping is outside Catalyst.",
  "Create retail plans on Plans from your contracted rate plans before operators assign SIMs.",
  "Only ATN can add or remove rate plans and catalogue SKUs on this contract. Contact ATN if you need a change.",
  "Order SIMs only lists catalogue products ATN ticked for your organisation on this contract.",
  "Ready or Deactivated SIMs: change rate plan freely within this contract.",
  "Active or Suspended: only until midnight on the 24th (Sydney), and only once per ICCID per month. After the cut-off: “Changes will be effective next month”.",
  "Plan changes is your log of ICCID plan moves. Billing follows the plan on the SIM in Catalyst.",
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
          {variant === "super_admin" ? (
            <Link href="/dashboard/catalogue" className="text-accent">
              Catalogue
            </Link>
          ) : null}
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
