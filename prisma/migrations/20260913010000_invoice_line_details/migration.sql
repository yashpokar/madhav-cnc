-- What was supplied, snapshotted from the order line.
ALTER TABLE "invoice_lines" ADD COLUMN "material_name" TEXT;
ALTER TABLE "invoice_lines" ADD COLUMN "material_supply" "MaterialSupply";
ALTER TABLE "invoice_lines" ADD COLUMN "size_text" TEXT;
