-- Many companies in one app. The existing company becomes the first one
-- (id 'default'); everything already in the database belongs to it.
INSERT INTO "company_settings" ("id", "updated_at")
VALUES ('default', now())
ON CONFLICT ("id") DO NOTHING;

-- DropIndex
DROP INDEX "credit_debit_notes_number_key";

-- DropIndex
DROP INDEX "customers_code_key";

-- DropIndex
DROP INDEX "dispatches_number_key";

-- DropIndex
DROP INDEX "expense_categories_name_key";

-- DropIndex
DROP INDEX "expenses_number_key";

-- DropIndex
DROP INDEX "invoices_number_key";

-- DropIndex
DROP INDEX "items_code_key";

-- DropIndex
DROP INDEX "materials_name_key";

-- DropIndex
DROP INDEX "orders_number_key";

-- DropIndex
DROP INDEX "partners_code_key";

-- DropIndex
DROP INDEX "payment_channels_name_key";

-- DropIndex
DROP INDEX "payments_number_key";

-- DropIndex
DROP INDEX "production_stages_name_key";

-- DropIndex
DROP INDEX "quotations_number_revision_key";

-- AlterTable
ALTER TABLE "activity_logs" ADD COLUMN     "company_id" TEXT DEFAULT 'default';

-- AlterTable
ALTER TABLE "credit_debit_notes" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "dispatches" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "expense_categories" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "partners" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "payment_channels" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "production_stages" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'default';

-- CreateTable
CREATE TABLE "user_companies" (
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_companies_pkey" PRIMARY KEY ("user_id","company_id")
);

-- CreateTable
CREATE TABLE "document_counters" (
    "company_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("company_id","key")
);

-- CreateIndex
CREATE INDEX "activity_logs_company_id_idx" ON "activity_logs"("company_id");

-- CreateIndex
CREATE INDEX "credit_debit_notes_company_id_idx" ON "credit_debit_notes"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_debit_notes_company_id_number_key" ON "credit_debit_notes"("company_id", "number");

-- CreateIndex
CREATE INDEX "customers_company_id_idx" ON "customers"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_company_id_code_key" ON "customers"("company_id", "code");

-- CreateIndex
CREATE INDEX "dispatches_company_id_idx" ON "dispatches"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispatches_company_id_number_key" ON "dispatches"("company_id", "number");

-- CreateIndex
CREATE INDEX "expense_categories_company_id_idx" ON "expense_categories"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_company_id_name_key" ON "expense_categories"("company_id", "name");

-- CreateIndex
CREATE INDEX "expenses_company_id_idx" ON "expenses"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_company_id_number_key" ON "expenses"("company_id", "number");

-- CreateIndex
CREATE INDEX "invoices_company_id_idx" ON "invoices"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_company_id_number_key" ON "invoices"("company_id", "number");

-- CreateIndex
CREATE INDEX "items_company_id_idx" ON "items"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "items_company_id_code_key" ON "items"("company_id", "code");

-- CreateIndex
CREATE INDEX "materials_company_id_idx" ON "materials"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "materials_company_id_name_key" ON "materials"("company_id", "name");

-- CreateIndex
CREATE INDEX "orders_company_id_idx" ON "orders"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_company_id_number_key" ON "orders"("company_id", "number");

-- CreateIndex
CREATE INDEX "partners_company_id_idx" ON "partners"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "partners_company_id_code_key" ON "partners"("company_id", "code");

-- CreateIndex
CREATE INDEX "payment_channels_company_id_idx" ON "payment_channels"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_channels_company_id_name_key" ON "payment_channels"("company_id", "name");

-- CreateIndex
CREATE INDEX "payments_company_id_idx" ON "payments"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_company_id_number_key" ON "payments"("company_id", "number");

-- CreateIndex
CREATE INDEX "production_stages_company_id_idx" ON "production_stages"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_stages_company_id_name_key" ON "production_stages"("company_id", "name");

-- CreateIndex
CREATE INDEX "quotations_company_id_idx" ON "quotations"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_company_id_number_revision_key" ON "quotations"("company_id", "number", "revision");

-- CreateIndex
CREATE INDEX "vendors_company_id_idx" ON "vendors"("company_id");

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_stages" ADD CONSTRAINT "production_stages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_channels" ADD CONSTRAINT "payment_channels_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_debit_notes" ADD CONSTRAINT "credit_debit_notes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- The default only existed to backfill existing rows.
ALTER TABLE "activity_logs" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "credit_debit_notes" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "customers" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "dispatches" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "expense_categories" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "expenses" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "invoices" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "items" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "materials" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "partners" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "payment_channels" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "payments" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "production_stages" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "quotations" ALTER COLUMN "company_id" DROP DEFAULT;
ALTER TABLE "vendors" ALTER COLUMN "company_id" DROP DEFAULT;

-- Everyone who could sign in before keeps the first company.
INSERT INTO "user_companies" ("user_id", "company_id")
SELECT "id", 'default' FROM "users"
ON CONFLICT DO NOTHING;

-- Numbering carries on from where the shared sequences stopped.
INSERT INTO "document_counters" ("company_id", "key", "value")
SELECT 'default', k.key, CASE WHEN s.is_called THEN s.last_value ELSE 0 END
FROM (VALUES
  ('customer','customer_code_seq'),('item','item_code_seq'),
  ('quotation','quotation_number_seq'),('order','order_number_seq'),
  ('dispatch','dispatch_number_seq'),('invoice','invoice_number_seq'),
  ('payment','payment_number_seq'),('expense','expense_number_seq'),
  ('CREDIT','credit_note_number_seq'),('DEBIT','debit_note_number_seq'),
  ('ARCHITECT','architect_code_seq'),('CARPENTER','carpenter_code_seq')
) AS k(key, seq)
JOIN LATERAL (
  SELECT last_value, is_called FROM (
    SELECT last_value, is_called FROM customer_code_seq WHERE k.seq='customer_code_seq'
    UNION ALL SELECT last_value, is_called FROM item_code_seq WHERE k.seq='item_code_seq'
    UNION ALL SELECT last_value, is_called FROM quotation_number_seq WHERE k.seq='quotation_number_seq'
    UNION ALL SELECT last_value, is_called FROM order_number_seq WHERE k.seq='order_number_seq'
    UNION ALL SELECT last_value, is_called FROM dispatch_number_seq WHERE k.seq='dispatch_number_seq'
    UNION ALL SELECT last_value, is_called FROM invoice_number_seq WHERE k.seq='invoice_number_seq'
    UNION ALL SELECT last_value, is_called FROM payment_number_seq WHERE k.seq='payment_number_seq'
    UNION ALL SELECT last_value, is_called FROM expense_number_seq WHERE k.seq='expense_number_seq'
    UNION ALL SELECT last_value, is_called FROM credit_note_number_seq WHERE k.seq='credit_note_number_seq'
    UNION ALL SELECT last_value, is_called FROM debit_note_number_seq WHERE k.seq='debit_note_number_seq'
    UNION ALL SELECT last_value, is_called FROM architect_code_seq WHERE k.seq='architect_code_seq'
    UNION ALL SELECT last_value, is_called FROM carpenter_code_seq WHERE k.seq='carpenter_code_seq'
  ) u
) s ON true
ON CONFLICT DO NOTHING;
