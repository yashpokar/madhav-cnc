CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'DISPATCHED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "quotation_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "architect_id" TEXT,
    "carpenter_id" TEXT,
    "material_supply" "MaterialSupply" NOT NULL DEFAULT 'WITH_MATERIAL',
    "subject" TEXT,
    "order_date" DATE NOT NULL,
    "due_date" DATE,
    "customer_po_number" TEXT,
    "site_address" TEXT,
    "site_city" TEXT,
    "site_pincode" TEXT,
    "discount_type" "DiscountType" NOT NULL DEFAULT 'NONE',
    "discount_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "round_off" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advance_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "terms" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "item_id" TEXT,
    "description" TEXT NOT NULL,
    "unit" "UnitOfMeasure" NOT NULL,
    "dimension_unit" "DimensionUnit",
    "length" DECIMAL(10,3),
    "width" DECIMAL(10,3),
    "pieces" DECIMAL(10,3),
    "quantity" DECIMAL(12,3) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "hsn_code" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");
CREATE INDEX "orders_status_idx" ON "orders"("status");
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");
CREATE INDEX "orders_quotation_id_idx" ON "orders"("quotation_id");
CREATE INDEX "orders_order_date_idx" ON "orders"("order_date");
CREATE INDEX "orders_due_date_idx" ON "orders"("due_date");
CREATE INDEX "order_lines_order_id_idx" ON "order_lines"("order_id");
CREATE INDEX "order_lines_item_id_idx" ON "order_lines"("item_id");

ALTER TABLE "orders" ADD CONSTRAINT "orders_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_architect_id_fkey" FOREIGN KEY ("architect_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_carpenter_id_fkey" FOREIGN KEY ("carpenter_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
