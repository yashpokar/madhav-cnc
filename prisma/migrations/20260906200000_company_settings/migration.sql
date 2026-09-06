CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "company_name" TEXT NOT NULL DEFAULT 'Madhav CNC',
    "address_line" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "bank_account_name" TEXT,
    "bank_name" TEXT,
    "bank_branch" TEXT,
    "account_number" TEXT,
    "ifsc_code" TEXT,
    "upi_id" TEXT,
    "upi_qr_stored_name" TEXT,
    "upi_qr_mime_type" TEXT,
    "invoice_terms" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "company_settings" ("id", "updated_at") VALUES ('default', CURRENT_TIMESTAMP);
