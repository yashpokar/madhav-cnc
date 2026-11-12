-- CreateTable
CREATE TABLE "payment_channels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "bank_account_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_channels_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "channel_id" TEXT;

-- AlterTable
ALTER TABLE "cash_credits" ADD COLUMN     "channel_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payment_channels_name_key" ON "payment_channels"("name");

-- AddForeignKey
ALTER TABLE "payment_channels" ADD CONSTRAINT "payment_channels_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "payment_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_credits" ADD CONSTRAINT "cash_credits_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "payment_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Starting list, taken from the sheet the business already uses.
INSERT INTO "payment_channels" ("id", "name", "mode", "bank_account_id", "sort_order") VALUES
    (gen_random_uuid()::text, 'CASH', 'CASH', NULL, 1),
    (gen_random_uuid()::text, 'HDFC NEFT', 'BANK_TRANSFER', (SELECT "id" FROM "bank_accounts" WHERE "name" = 'HDFC'), 2),
    (gen_random_uuid()::text, 'SBI UPI', 'UPI', (SELECT "id" FROM "bank_accounts" WHERE "name" = 'SHUBH SBI'), 3);
