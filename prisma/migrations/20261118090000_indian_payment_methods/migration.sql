-- Indian payment methods: each new enum value is its own statement (Postgres
-- does not let a value added in a transaction be used in the same one, and
-- this keeps every statement independent). BANK_TRANSFER stays as a legacy
-- value for existing rows.
ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'NEFT';

ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'RTGS';

ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'IMPS';

ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'NET_BANKING';

ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'DEMAND_DRAFT';

ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'WALLET';

-- Structured, per-method fields (nullable; existing rows are untouched).
ALTER TABLE "payments" ADD COLUMN "payment_details" JSONB;

ALTER TABLE "expenses" ADD COLUMN "payment_details" JSONB;

ALTER TABLE "vendor_payments" ADD COLUMN "payment_details" JSONB;

-- How the business itself receives money in a payment mode.
ALTER TABLE "payment_channels" ADD COLUMN "account_details" JSONB;
