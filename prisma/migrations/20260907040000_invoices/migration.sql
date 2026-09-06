CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER');

CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "order_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE,
    "place_of_supply" TEXT,
    "is_inter_state" BOOLEAN NOT NULL DEFAULT false,
    "billing_address" TEXT,
    "customer_gstin" TEXT,
    "discount_type" "DiscountType" NOT NULL DEFAULT 'NONE',
    "discount_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transport_charge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transport_tax_rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "round_off" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advance_adjusted" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "terms" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "item_id" TEXT,
    "description" TEXT NOT NULL,
    "hsn_code" TEXT,
    "unit" "UnitOfMeasure" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'UPI',
    "reference" TEXT,
    "paid_on" DATE NOT NULL,
    "notes" TEXT,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");
CREATE INDEX "invoices_status_idx" ON "invoices"("status");
CREATE INDEX "invoices_customer_id_idx" ON "invoices"("customer_id");
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");
CREATE INDEX "invoices_invoice_date_idx" ON "invoices"("invoice_date");
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");
CREATE INDEX "invoice_lines_item_id_idx" ON "invoice_lines"("item_id");
CREATE UNIQUE INDEX "payments_number_key" ON "payments"("number");
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");
CREATE INDEX "payments_paid_on_idx" ON "payments"("paid_on");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS payment_number_seq START 1;
