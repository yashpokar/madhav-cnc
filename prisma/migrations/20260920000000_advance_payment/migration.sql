-- AlterTable
ALTER TABLE "payments" ADD COLUMN "order_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing advances become receipts (mode unknown, so UPI like the default),
-- numbered after the current receipts.
INSERT INTO "payments" ("id", "number", "customer_id", "amount", "mode", "paid_on", "notes", "order_id", "created_at")
SELECT
  'adv_' || o."id",
  'ADV-' || o."number",
  o."customer_id",
  o."advance_amount",
  'UPI',
  o."order_date",
  'Advance for order ' || o."number",
  o."id",
  CURRENT_TIMESTAMP
FROM "orders" o
WHERE o."advance_amount" > 0;
