-- Reseller Plan allowances: inclusive SMS (msgs) and voice (min). 0 = PAYG.
ALTER TABLE modem_allowances ADD COLUMN allowance_sms REAL;
ALTER TABLE modem_allowances ADD COLUMN allowance_voice_min REAL;
