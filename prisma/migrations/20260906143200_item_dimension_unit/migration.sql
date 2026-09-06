CREATE TYPE "DimensionUnit" AS ENUM ('MM', 'INCH', 'FT');

ALTER TABLE "items" ADD COLUMN "dimension_unit" "DimensionUnit" NOT NULL DEFAULT 'MM';

ALTER TABLE "items" RENAME COLUMN "thickness_mm" TO "thickness";
ALTER TABLE "items" RENAME COLUMN "length_mm" TO "length";
ALTER TABLE "items" RENAME COLUMN "width_mm" TO "width";

ALTER TABLE "items" ALTER COLUMN "thickness" TYPE DECIMAL(10,3);
ALTER TABLE "items" ALTER COLUMN "length" TYPE DECIMAL(10,3);
ALTER TABLE "items" ALTER COLUMN "width" TYPE DECIMAL(10,3);
