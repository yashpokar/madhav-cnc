-- The Day book is gone: its own tables and the columns that served only it.
DROP TABLE IF EXISTS "cash_credits" CASCADE;
DROP TABLE IF EXISTS "day_tally_counts" CASCADE;
DROP TABLE IF EXISTS "day_tally_banks" CASCADE;
DROP TABLE IF EXISTS "day_closes" CASCADE;
DROP TABLE IF EXISTS "cash_denominations" CASCADE;
DROP TABLE IF EXISTS "bank_accounts" CASCADE;

ALTER TABLE "payment_channels" DROP COLUMN IF EXISTS "bank_account_id";
ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "daybook_layout";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "is_checked";
ALTER TABLE "expenses" DROP COLUMN IF EXISTS "is_checked";
