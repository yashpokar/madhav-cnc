-- AlterTable
ALTER TABLE "orders" ADD COLUMN "tracking_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_tracking_token_key" ON "orders"("tracking_token");
