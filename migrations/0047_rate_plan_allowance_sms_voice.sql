-- Supplier code allowances: inclusive SMS (msgs) and voice (min). 0 = PAYG.
ALTER TABLE rate_plan_allowances ADD COLUMN allowance_sms REAL;
ALTER TABLE rate_plan_allowances ADD COLUMN allowance_voice_min REAL;
