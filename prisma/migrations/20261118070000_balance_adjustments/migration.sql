-- CreateEnum
CREATE TYPE "BalanceAdjustmentReason" AS ENUM ('FORGOTTEN_ENTRY', 'BANK_CHARGES', 'INTEREST', 'CASH_SHORT_EXCESS', 'WRITE_OFF', 'CORRECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "BalanceAdjustmentKind" AS ENUM ('CHANNEL', 'CUSTOMER');

-- CreateTable
CREATE TABLE "balance_adjustments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "number" TEXT NOT NULL,
    "kind" "BalanceAdjustmentKind" NOT NULL,
    "channel_id" TEXT,
    "customer_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "adjusted_on" DATE NOT NULL,
    "reason" "BalanceAdjustmentReason" NOT NULL,
    "note" TEXT NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balance_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "balance_adjustments_company_id_idx" ON "balance_adjustments"("company_id");

-- CreateIndex
CREATE INDEX "balance_adjustments_channel_id_idx" ON "balance_adjustments"("channel_id");

-- CreateIndex
CREATE INDEX "balance_adjustments_customer_id_idx" ON "balance_adjustments"("customer_id");

-- CreateIndex
CREATE INDEX "balance_adjustments_adjusted_on_idx" ON "balance_adjustments"("adjusted_on");

-- CreateIndex
CREATE UNIQUE INDEX "balance_adjustments_company_id_number_key" ON "balance_adjustments"("company_id", "number");

-- AddForeignKey
ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "payment_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A non-zero amount, and exactly the one id that matches the kind.
ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_amount_nonzero_check" CHECK ("amount" <> 0);

ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_target_check" CHECK (
  ("kind" = 'CHANNEL' AND "channel_id" IS NOT NULL AND "customer_id" IS NULL)
  OR ("kind" = 'CUSTOMER' AND "customer_id" IS NOT NULL AND "channel_id" IS NULL)
);
