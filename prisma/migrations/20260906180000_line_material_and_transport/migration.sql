ALTER TABLE "quotation_lines" ADD COLUMN "material_supply" "MaterialSupply" NOT NULL DEFAULT 'WITH_MATERIAL';
ALTER TABLE "order_lines" ADD COLUMN "material_supply" "MaterialSupply" NOT NULL DEFAULT 'WITH_MATERIAL';

UPDATE "quotation_lines" l
SET "material_supply" = q."material_supply"
FROM "quotations" q
WHERE q."id" = l."quotation_id";

UPDATE "order_lines" l
SET "material_supply" = o."material_supply"
FROM "orders" o
WHERE o."id" = l."order_id";

ALTER TABLE "orders" ADD COLUMN "transport_charge" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "transport_tax_rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 18;
