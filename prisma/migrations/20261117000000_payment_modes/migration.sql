
-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "mode_name" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "mode_name" TEXT;


-- History keeps the name of the mode it was recorded with.
UPDATE "payments" p SET "mode_name" = c."name"
FROM "payment_channels" c WHERE p."channel_id" = c."id";
UPDATE "expenses" e SET "mode_name" = c."name"
FROM "payment_channels" c WHERE e."channel_id" = c."id";

-- Every company starts with the usual modes; they can rename, add and hide them.
INSERT INTO "payment_channels" ("id", "company_id", "name", "mode", "sort_order", "is_active")
SELECT gen_random_uuid()::text, co."id", m."name", m."mode"::"PaymentMode", m."sort", true
FROM "company_settings" co
CROSS JOIN (VALUES
  ('Cash', 'CASH', 10), ('UPI', 'UPI', 20), ('Bank transfer', 'BANK_TRANSFER', 30),
  ('Cheque', 'CHEQUE', 40), ('Card', 'CARD', 50)
) AS m("name", "mode", "sort")
WHERE NOT EXISTS (SELECT 1 FROM "payment_channels" x WHERE x."company_id" = co."id")
ON CONFLICT DO NOTHING;
