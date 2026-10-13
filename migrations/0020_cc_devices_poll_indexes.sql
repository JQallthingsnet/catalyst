-- Cut D1 rows_read on auto-poll enrich queues and list ORDER BY polled_at.
CREATE INDEX IF NOT EXISTS cc_devices_polled_at ON cc_devices (polled_at);
CREATE INDEX IF NOT EXISTS cc_devices_details_polled_at ON cc_devices (details_polled_at);
CREATE INDEX IF NOT EXISTS cc_devices_customer ON cc_devices (customer);
CREATE INDEX IF NOT EXISTS cc_devices_status ON cc_devices (status);
