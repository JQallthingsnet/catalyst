ALTER TABLE cc_devices ADD COLUMN supplier TEXT NOT NULL DEFAULT 'Optus';
UPDATE cc_devices SET supplier = 'Optus' WHERE IFNULL(TRIM(supplier), '') = '' OR supplier = 'Cisco IoT Control Center';
UPDATE platform_plans SET supplier = 'Optus' WHERE supplier = 'Cisco IoT Control Center';
