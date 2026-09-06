CREATE TYPE "DispatchStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'DELIVERED', 'CANCELLED');

CREATE TABLE "dispatches" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'DRAFT',
    "order_id" TEXT NOT NULL,
    "dispatch_date" DATE NOT NULL,
    "delivered_at" TIMESTAMP(3),
    "vehicle_number" TEXT,
    "driver_name" TEXT,
    "driver_phone" TEXT,
    "transporter_name" TEXT,
    "lr_number" TEXT,
    "delivery_address" TEXT,
    "delivery_city" TEXT,
    "delivery_pincode" TEXT,
    "received_by_name" TEXT,
    "received_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dispatch_lines" (
    "id" TEXT NOT NULL,
    "dispatch_id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "unit" "UnitOfMeasure" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "dispatch_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispatches_number_key" ON "dispatches"("number");
CREATE INDEX "dispatches_order_id_idx" ON "dispatches"("order_id");
CREATE INDEX "dispatches_status_idx" ON "dispatches"("status");
CREATE INDEX "dispatches_dispatch_date_idx" ON "dispatches"("dispatch_date");
CREATE INDEX "dispatch_lines_dispatch_id_idx" ON "dispatch_lines"("dispatch_id");
CREATE INDEX "dispatch_lines_order_line_id_idx" ON "dispatch_lines"("order_line_id");

ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE SEQUENCE IF NOT EXISTS dispatch_number_seq START 1;
