-- Billing foundation (additive). Existing companies are grandfathered on BUSINESS.

CREATE TYPE "BillingPlan" AS ENUM ('FREE', 'BUSINESS', 'BUSINESS_PRO');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');
CREATE TYPE "SubscriptionSource" AS ENUM ('SELF_SERVE', 'GRANDFATHERED', 'MANUAL');
CREATE TYPE "BillingPaymentStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'REFUNDED');

CREATE TABLE "company_subscriptions" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "plan" "BillingPlan" NOT NULL DEFAULT 'FREE',
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "source" "SubscriptionSource" NOT NULL DEFAULT 'SELF_SERVE',
  "current_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "current_period_end" TIMESTAMP(3),
  "grace_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "company_subscriptions_company_id_key" ON "company_subscriptions"("company_id");
ALTER TABLE "company_subscriptions" ADD CONSTRAINT "company_subscriptions_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "billing_payments" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL DEFAULT '',
  "plan" "BillingPlan" NOT NULL,
  "amount_paise" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "tax_paise" INTEGER NOT NULL DEFAULT 0,
  "status" "BillingPaymentStatus" NOT NULL DEFAULT 'CREATED',
  "provider" TEXT NOT NULL,
  "provider_order_id" TEXT NOT NULL,
  "provider_payment_id" TEXT,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "created_by_id" TEXT,
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_payments_provider_order_id_key" ON "billing_payments"("provider_order_id");
CREATE UNIQUE INDEX "billing_payments_provider_payment_id_key" ON "billing_payments"("provider_payment_id");
CREATE INDEX "billing_payments_company_id_created_at_idx" ON "billing_payments"("company_id", "created_at");
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- When an invoice was first issued. Counted once, never cleared.
ALTER TABLE "invoices" ADD COLUMN "issued_at" TIMESTAMP(3);
CREATE INDEX "invoices_company_id_issued_at_idx" ON "invoices"("company_id", "issued_at");

-- Backfill: invoices already issued, and cancelled ones (cancelling an issued invoice must not free a slot).
UPDATE "invoices" SET "issued_at" = "updated_at" WHERE "status" IN ('ISSUED', 'CANCELLED') AND "issued_at" IS NULL;

-- Stamp issued_at in the database, so every code path (web, API, imports) is covered
-- without touching the invoice code.
CREATE OR REPLACE FUNCTION set_invoice_issued_at() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'ISSUED' AND NEW."issued_at" IS NULL THEN
    NEW."issued_at" := CURRENT_TIMESTAMP;
  END IF;
  -- Never cleared once set.
  IF TG_OP = 'UPDATE' AND OLD."issued_at" IS NOT NULL THEN
    NEW."issued_at" := OLD."issued_at";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoices_set_issued_at"
  BEFORE INSERT OR UPDATE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION set_invoice_issued_at();

-- Grandfather every existing company on BUSINESS, no expiry.
INSERT INTO "company_subscriptions" ("id", "company_id", "plan", "status", "source", "current_period_start", "current_period_end", "updated_at")
SELECT 'sub_' || md5("id" || 'billing'), "id", 'BUSINESS', 'ACTIVE', 'GRANDFATHERED', CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP
FROM "company_settings";
