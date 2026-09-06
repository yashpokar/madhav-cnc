ALTER TABLE "payments" ADD COLUMN "customer_id" TEXT;

UPDATE "payments" p
SET "customer_id" = i."customer_id"
FROM "invoices" i
WHERE i."id" = p."invoice_id";

DELETE FROM "payments" WHERE "customer_id" IS NULL;

ALTER TABLE "payments" ALTER COLUMN "customer_id" SET NOT NULL;

CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

INSERT INTO "payment_allocations" ("id", "payment_id", "invoice_id", "amount", "created_at")
SELECT gen_random_uuid()::text, p."id", p."invoice_id", p."amount", p."created_at"
FROM "payments" p
WHERE p."invoice_id" IS NOT NULL;

CREATE UNIQUE INDEX "payment_allocations_payment_id_invoice_id_key" ON "payment_allocations"("payment_id", "invoice_id");
CREATE INDEX "payment_allocations_invoice_id_idx" ON "payment_allocations"("invoice_id");

ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "payments_invoice_id_idx";
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_invoice_id_fkey";
ALTER TABLE "payments" DROP COLUMN "invoice_id";

CREATE INDEX "payments_customer_id_idx" ON "payments"("customer_id");
