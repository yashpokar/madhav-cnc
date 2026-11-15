
-- AlterTable
ALTER TABLE "payment_channels" ADD COLUMN     "details" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "qr_mime_type" TEXT,
ADD COLUMN     "qr_stored_name" TEXT,
ADD COLUMN     "show_on_documents" BOOLEAN NOT NULL DEFAULT false;


-- The bank and UPI details that lived on the company move onto payment modes,
-- where the owner can edit, add and remove them freely.

-- A bank-transfer mode for any company that has bank details but no such mode.
INSERT INTO "payment_channels" ("id", "company_id", "name", "mode", "sort_order", "is_active")
SELECT gen_random_uuid()::text, co."id", 'Bank transfer', 'BANK_TRANSFER', 30, true
FROM "company_settings" co
WHERE co."account_number" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "payment_channels" c WHERE c."company_id" = co."id" AND c."mode" = 'BANK_TRANSFER'
  )
ON CONFLICT DO NOTHING;

UPDATE "payment_channels" c
SET "details" = d."items", "show_on_documents" = true
FROM (
  SELECT DISTINCT ON (co."id") ch."id" AS channel_id,
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.value) ORDER BY x.ord), '[]'::jsonb)
      FROM (VALUES
        (1, 'Account name', co."bank_account_name"),
        (2, 'Bank', co."bank_name"),
        (3, 'Branch', co."bank_branch"),
        (4, 'Account number', co."account_number"),
        (5, 'IFSC', co."ifsc_code")
      ) AS x(ord, label, value)
      WHERE x.value IS NOT NULL AND x.value <> ''
    ) AS items
  FROM "company_settings" co
  JOIN "payment_channels" ch ON ch."company_id" = co."id" AND ch."mode" = 'BANK_TRANSFER'
  WHERE co."account_number" IS NOT NULL
  ORDER BY co."id", ch."sort_order", ch."name"
) d
WHERE c."id" = d.channel_id;

-- Likewise a UPI mode for any company with a UPI ID or QR code.
INSERT INTO "payment_channels" ("id", "company_id", "name", "mode", "sort_order", "is_active")
SELECT gen_random_uuid()::text, co."id", 'UPI', 'UPI', 20, true
FROM "company_settings" co
WHERE (co."upi_id" IS NOT NULL OR co."upi_qr_stored_name" IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "payment_channels" c WHERE c."company_id" = co."id" AND c."mode" = 'UPI'
  )
ON CONFLICT DO NOTHING;

UPDATE "payment_channels" c
SET "details" = d."items",
    "show_on_documents" = true,
    "qr_stored_name" = d."qr_name",
    "qr_mime_type" = d."qr_mime"
FROM (
  SELECT DISTINCT ON (co."id") ch."id" AS channel_id,
    co."upi_qr_stored_name" AS qr_name,
    co."upi_qr_mime_type" AS qr_mime,
    CASE WHEN co."upi_id" IS NOT NULL AND co."upi_id" <> ''
      THEN jsonb_build_array(jsonb_build_object('label', 'UPI ID', 'value', co."upi_id"))
      ELSE '[]'::jsonb END AS items
  FROM "company_settings" co
  JOIN "payment_channels" ch ON ch."company_id" = co."id" AND ch."mode" = 'UPI'
  WHERE co."upi_id" IS NOT NULL OR co."upi_qr_stored_name" IS NOT NULL
  ORDER BY co."id", ch."sort_order", ch."name"
) d
WHERE c."id" = d.channel_id;
