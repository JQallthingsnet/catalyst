-- Catalyst-owned Reseller Plan on the CC snapshot (not pushed to Jasper modem_ID).
ALTER TABLE cc_devices ADD COLUMN platform_plan_id TEXT;

CREATE INDEX IF NOT EXISTS cc_devices_platform_plan_id
  ON cc_devices (platform_plan_id)
  WHERE platform_plan_id IS NOT NULL AND TRIM(platform_plan_id) != '';
