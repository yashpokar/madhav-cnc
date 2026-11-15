ALTER TABLE "company_settings"
  ADD COLUMN "signature_stored_name" TEXT,
  ADD COLUMN "signature_mime_type" TEXT,
  ADD COLUMN "stamp_stored_name" TEXT,
  ADD COLUMN "stamp_mime_type" TEXT,
  ADD COLUMN "signatory_name" TEXT,
  ADD COLUMN "signatory_title" TEXT;
