-- GST is typed in by hand now, so new rows start at 0. Existing rows keep
-- whatever rate they were saved with.
ALTER TABLE "items" ALTER COLUMN "tax_rate_percent" SET DEFAULT 0;
ALTER TABLE "orders" ALTER COLUMN "transport_tax_rate_percent" SET DEFAULT 0;
ALTER TABLE "invoices" ALTER COLUMN "transport_tax_rate_percent" SET DEFAULT 0;
