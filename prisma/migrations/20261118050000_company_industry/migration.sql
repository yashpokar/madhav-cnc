-- The industry a company chose at setup. Existing companies stay MANUFACTURING.
ALTER TABLE "company_settings" ADD COLUMN "industry" TEXT NOT NULL DEFAULT 'MANUFACTURING';
