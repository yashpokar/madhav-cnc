-- CreateEnum
CREATE TYPE "WriteOffReason" AS ENUM ('CUSTOMER_UNREACHABLE', 'DISPUTE', 'QUALITY_ISSUE', 'BUSINESS_CLOSED', 'SETTLED_FOR_LESS', 'LEGAL_ACTION', 'OTHER');

-- CreateTable
CREATE TABLE "invoice_write_offs" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" "WriteOffReason" NOT NULL,
    "notes" TEXT,
    "written_off_on" DATE NOT NULL,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_write_offs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_write_offs_invoice_id_idx" ON "invoice_write_offs"("invoice_id");

-- AddForeignKey
ALTER TABLE "invoice_write_offs" ADD CONSTRAINT "invoice_write_offs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_write_offs" ADD CONSTRAINT "invoice_write_offs_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
