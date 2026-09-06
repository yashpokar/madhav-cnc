CREATE TABLE "quotation_attachments" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "comment" TEXT,
    "uploaded_by_id" TEXT,
    "removed_at" TIMESTAMP(3),
    "removed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quotation_attachments_stored_name_key" ON "quotation_attachments"("stored_name");
CREATE INDEX "quotation_attachments_quotation_id_idx" ON "quotation_attachments"("quotation_id");
CREATE INDEX "quotation_attachments_removed_at_idx" ON "quotation_attachments"("removed_at");

ALTER TABLE "quotation_attachments" ADD CONSTRAINT "quotation_attachments_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_attachments" ADD CONSTRAINT "quotation_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_attachments" ADD CONSTRAINT "quotation_attachments_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
