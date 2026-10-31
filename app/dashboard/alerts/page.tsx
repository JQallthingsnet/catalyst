import { AlertSettingsForm } from "@/components/portal/alert-settings-form";
import { OrderNotifySettingsForm } from "@/components/portal/order-notify-settings-form";
import { SendUsageDigestButton } from "@/components/portal/send-usage-digest-button";
import {
  getAlertSettingsForScope,
  PLATFORM_ALERT_SCOPE,
  type AlertKind,
} from "@/lib/portal/alert-settings";
import { requirePrivilege } from "@/lib/portal/guard";
import { getOrderNotifySetting } from "@/lib/portal/order-notify";
import { formatAuDateTime } from "@/lib/portal/time";

export default async function AlertsPage() {
  const ctx = await requirePrivilege("alerts.manage");
  const onPlatform = ctx.role === "super_admin";
  const scopeId = onPlatform ? PLATFORM_ALERT_SCOPE : ctx.tenantId;
  const kinds: AlertKind[] = onPlatform ? ["pool"] : ["pool", "usage"];
  const [settings, orderNotify] = await Promise.all([
    getAlertSettingsForScope(scopeId, kinds),
    onPlatform ? getOrderNotifySetting() : Promise.resolve(null),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Alerts</h1>
          <p className="mt-1 text-sm text-quiet">
            {onPlatform
              ? "Configure pool digests, who is emailed when a reseller Orders SIMs, and who is emailed when a Reseller Plan changes."
              : "Daily emails when your Pools or Usage hit your thresholds, and immediate email when a Reseller Plan changes on your SIMs. Configure recipients and trigger % for each."}
          </p>
        </div>
        {onPlatform ? <SendUsageDigestButton /> : null}
      </div>

      <div className="mt-6 space-y-4">
        {onPlatform && orderNotify ? (
          <OrderNotifySettingsForm initialRecipients={orderNotify.recipients} />
        ) : null}
        <AlertSettingsForm
          kind="pool"
          title="Pool usage"
          blurb={
            onPlatform
              ? "Σ CTD MB ÷ Σ Reseller Plan allowance across SIMs on each Reseller Plan per customer. These recipients also get email when any Reseller Plan changes."
              : "Σ CTD MB ÷ Σ Reseller Plan allowance for your Control Center customer. These recipients also get email when a Reseller Plan changes on your SIMs."
          }
          initial={settings.pool}
        />
        {!onPlatform ? (
          <AlertSettingsForm
            kind="usage"
            title="SIM usage"
            blurb="Per SIM, CTD MB ÷ Reseller Plan allowance for your Control Center customer. These recipients also get email when a Reseller Plan changes on your SIMs."
            initial={settings.usage}
          />
        ) : null}
      </div>

      <p className="mt-6 text-xs text-quiet">
        Digests send near Sydney midnight (once per calendar day). Reseller Plan change emails send immediately to
        saved recipients (no threshold required beyond having emails listed).{" "}
        {settings.pool.updatedAt
          ? `Pool settings last saved ${formatAuDateTime(settings.pool.updatedAt)}${
              settings.pool.updatedBy ? ` by ${settings.pool.updatedBy}` : ""
            }.`
          : "Pool alerts are off until you save recipients."}
        {!onPlatform && settings.usage?.updatedAt
          ? ` Usage settings last saved ${formatAuDateTime(settings.usage.updatedAt)}${
              settings.usage.updatedBy ? ` by ${settings.usage.updatedBy}` : ""
            }.`
          : !onPlatform
            ? " Usage alerts are off until you save recipients."
            : ""}
      </p>
    </div>
  );
}
