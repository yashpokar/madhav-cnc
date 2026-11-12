-- Lines can bill their size exactly as entered (manual) or rounded up to 3 inch
-- steps (auto). Lines that already exist were priced before the rule, so they
-- stay manual and keep their agreed amounts.
ALTER TABLE "quotation_lines" ADD COLUMN "auto_size" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "order_lines" ADD COLUMN "auto_size" BOOLEAN NOT NULL DEFAULT true;

UPDATE "quotation_lines" SET "auto_size" = false;
UPDATE "order_lines" SET "auto_size" = false;
