import Link from "next/link";

const SUPER_ADMIN_RULES = [
  "Onboard on Contract in order: create organisation (unique name) → create/bind Reseller Plan (1:1) → bind catalogue SKUs (1:many) → invite reseller admin(s) → upload signed PDF.",
  "Organisation name is unique across Catalyst and appears top left for that reseller.",
  "Reseller Plan binding is 1:1 (one plan → one organisation). Catalogue SKUs are 1:many per organisation.",
  "Multiple reseller admins are allowed per organisation (backup). Operators can be invited by ATN here or later by a reseller admin from Settings.",
  "Upload the signed contract PDF on the organisation’s Contract page. Super admin and that reseller admin can view and download it.",
  "ICCID is the unique identifier across Catalyst and every supplier feed.",
  "Every SIM a reseller assigns to a customer must map to one contracted rate plan.",
  "Sell stock (once per org): set Customer on SIMs in Jasper, Sync, then bind that Customer to the reseller. First import: modem_ID set → mirror as-is (may be off-contract); modem_ID empty → Supplier code (exact one) → contract default. Later Sync adds new SIMs; Change plan moves to a contracted Reseller Plan.",
  "Assign SIMs (reseller → end customer) is separate: operators attach an org ICCID to a portal end customer and any retail plan on contract. If the SIM’s Reseller Plan differs, Assign applies the same Plan changes rules. Physical shipping is outside Catalyst.",
  "Rate plans: only bound resellers can see and use a rate plan. Bind them on Contract before selling stock.",
  "Unbind rate plans before removing the last catalogue SKU from a reseller’s contract.",
  "Reseller Plan changes are allowed any time within contracted plans (any SIM state).",
  "Each Sydney day keeps every Reseller Plan used on each ICCID (more than one row that day if the plan changed). Export daily plans CSV from Plan changes.",
  "On Contract, set Unit Price (AUD) per Reseller Plan — that is what ATN charges the reseller organisation on invoice. If two plans occur on the same Sydney day, the higher unit price is billed (ties: default plan, then name).",
  "Plan changes update the Reseller Plan. ATN bills from that Catalyst plan — not from Jasper. Whether to also change Jasper is ATN’s choice later.",
  "Snapshot differs / Push are super-admin only (CC vs Catalyst). They do not change reseller billing.",
  "Plan changes is the log book: super admin sees all resellers (with Organisation); reseller admin sees only their own ICCIDs.",
];

const RESELLER_ADMIN_RULES = [
  "ICCID is the unique identifier for every SIM.",
  "When you assign a SIM to a customer, it must use one of the rate plans on this contract.",
  "ATN binds your organisation once to a Control Center Customer. SIMs with that Customer become yours in Catalyst (Sync keeps adding new ones). Reseller Plan starts from modem_ID as-is (or Supplier code / contract default if empty); later Change plan uses contracted plans only.",
  "Assign SIMs maps your ICCIDs to end customers and any retail plan on this contract. Shipping is outside Catalyst.",
  "Create retail plans on Plans from your contracted rate plans before operators assign SIMs.",
  "Inclusive Data / SMS / Voice on each Reseller Plan is set by ATN (0 = PAYG). It appears on Contract (and Jasper-carried plans on your SIMs), and drives Pools / Usage / Invoices.",
  "If ATN uploaded a signed contract PDF, you can view and download it on this page.",
  "Only ATN can add or remove rate plans and catalogue SKUs on this contract. Contact ATN if you need a change.",
  "Order SIMs only lists catalogue products ATN ticked for your organisation on this contract.",
  "Change Reseller Plan any time within this contract (any SIM state).",
  "Plan changes is your log of ICCID plan moves. Daily plans CSV lists every Reseller Plan used per ICCID per day.",
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
    </article>
  );
}
