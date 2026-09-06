CREATE TYPE "SupplyType" AS ENUM ('GOODS', 'SERVICE');

ALTER TABLE "items" ADD COLUMN "supply_type" "SupplyType" NOT NULL DEFAULT 'GOODS';
ALTER TABLE "items" ADD COLUMN "is_flat_rate" BOOLEAN NOT NULL DEFAULT false;

UPDATE "items" SET "supply_type" = 'SERVICE' WHERE "type" = 'SERVICE';

ALTER TABLE "quotation_lines" ADD COLUMN "is_flat_rate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "order_lines" ADD COLUMN "is_flat_rate" BOOLEAN NOT NULL DEFAULT false;
