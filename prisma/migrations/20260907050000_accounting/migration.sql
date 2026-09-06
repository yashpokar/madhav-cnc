CREATE TYPE "NoteKind" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "NoteParty" AS ENUM ('CUSTOMER', 'VENDOR');
CREATE TYPE "NoteReason" AS ENUM ('SALES_RETURN', 'PURCHASE_RETURN', 'RATE_DIFFERENCE', 'DISCOUNT', 'SHORT_SUPPLY', 'DAMAGED_GOODS', 'OTHER');
CREATE TYPE "NoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "category_id" TEXT,
    "expense_date" DATE NOT NULL,
    "payee_name" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "tax_rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "is_input_credit" BOOLEAN NOT NULL DEFAULT false,
    "vendor_gstin" TEXT,
    "bill_number" TEXT,
    "payment_mode" "PaymentMode" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "notes" TEXT,
    "order_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_debit_notes" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "NoteKind" NOT NULL,
    "status" "NoteStatus" NOT NULL DEFAULT 'DRAFT',
    "party_type" "NoteParty" NOT NULL,
    "reason" "NoteReason" NOT NULL DEFAULT 'OTHER',
    "customer_id" TEXT,
    "vendor_name" TEXT,
    "vendor_gstin" TEXT,
    "invoice_id" TEXT,
    "note_date" DATE NOT NULL,
    "place_of_supply" TEXT,
    "is_inter_state" BOOLEAN NOT NULL DEFAULT false,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "round_off" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reason_note" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_debit_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_debit_note_lines" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "hsn_code" TEXT,
    "unit" "UnitOfMeasure" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "tax_rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "credit_debit_note_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");
CREATE INDEX "expense_categories_is_active_idx" ON "expense_categories"("is_active");
CREATE UNIQUE INDEX "expenses_number_key" ON "expenses"("number");
CREATE INDEX "expenses_expense_date_idx" ON "expenses"("expense_date");
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");
CREATE INDEX "expenses_order_id_idx" ON "expenses"("order_id");
CREATE UNIQUE INDEX "credit_debit_notes_number_key" ON "credit_debit_notes"("number");
CREATE INDEX "credit_debit_notes_kind_idx" ON "credit_debit_notes"("kind");
CREATE INDEX "credit_debit_notes_status_idx" ON "credit_debit_notes"("status");
CREATE INDEX "credit_debit_notes_customer_id_idx" ON "credit_debit_notes"("customer_id");
CREATE INDEX "credit_debit_notes_invoice_id_idx" ON "credit_debit_notes"("invoice_id");
CREATE INDEX "credit_debit_notes_note_date_idx" ON "credit_debit_notes"("note_date");
CREATE INDEX "credit_debit_note_lines_note_id_idx" ON "credit_debit_note_lines"("note_id");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_debit_notes" ADD CONSTRAINT "credit_debit_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_debit_notes" ADD CONSTRAINT "credit_debit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_debit_notes" ADD CONSTRAINT "credit_debit_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_debit_notes" ADD CONSTRAINT "credit_debit_notes_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_debit_note_lines" ADD CONSTRAINT "credit_debit_note_lines_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "credit_debit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE SEQUENCE IF NOT EXISTS expense_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS credit_note_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS debit_note_number_seq START 1;
