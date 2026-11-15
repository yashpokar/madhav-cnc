-- Who created a company through self-service onboarding (NULL for companies a
-- platform super-admin added). Used to cap self-created companies per person.
ALTER TABLE "company_settings" ADD COLUMN "created_by_id" TEXT;

CREATE INDEX "company_settings_created_by_id_idx" ON "company_settings"("created_by_id");

ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
