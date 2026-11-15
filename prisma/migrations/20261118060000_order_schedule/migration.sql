-- Optional schedule on an order: when and where it happens, and for how many.
ALTER TABLE "orders" ADD COLUMN "starts_at" TIMESTAMP(3),
ADD COLUMN "ends_at" TIMESTAMP(3),
ADD COLUMN "venue" TEXT,
ADD COLUMN "headcount" INTEGER;

CREATE INDEX "orders_company_id_starts_at_idx" ON "orders"("company_id", "starts_at");
