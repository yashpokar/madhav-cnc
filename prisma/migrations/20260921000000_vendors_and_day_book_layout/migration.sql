-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN "daybook_layout" JSONB;

-- AlterTable
ALTER TABLE "cash_denominations" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

-- Keep today's order (largest note first) as the starting order.
UPDATE "cash_denominations" d SET "sort_order" = r.rn
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "value" DESC) AS rn FROM "cash_denominations") r
WHERE d."id" = r."id";

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "address" TEXT,
    "city" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendors_name_idx" ON "vendors"("name");

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "vendor_id" TEXT;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Turn every distinct payee already used (ignoring case and spacing) into a
-- vendor, keeping the first spelling, and link the existing expenses to it.
INSERT INTO "vendors" ("id", "name", "gstin", "updated_at")
SELECT 'ven_' || md5(lower(trim(e."payee_name"))),
       (array_agg(trim(e."payee_name") ORDER BY e."created_at"))[1],
       (array_agg(e."vendor_gstin") FILTER (WHERE e."vendor_gstin" IS NOT NULL))[1],
       CURRENT_TIMESTAMP
FROM "expenses" e
WHERE trim(e."payee_name") <> ''
GROUP BY lower(trim(e."payee_name"));

UPDATE "expenses" e SET "vendor_id" = 'ven_' || md5(lower(trim(e."payee_name")))
WHERE trim(e."payee_name") <> '';
