-- Additive: the receipt photo an expense was recorded with (an uploads.id of the same company).
ALTER TABLE "expenses" ADD COLUMN "receipt_upload_id" TEXT;
