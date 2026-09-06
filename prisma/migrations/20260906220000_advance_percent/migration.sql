ALTER TABLE "company_settings" ADD COLUMN "default_advance_percent" DECIMAL(5,2) NOT NULL DEFAULT 80;
ALTER TABLE "quotations" ADD COLUMN "advance_percent" DECIMAL(5,2) NOT NULL DEFAULT 80;
