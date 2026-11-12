-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "is_checked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "cash_credits" ADD COLUMN     "is_checked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "is_checked" BOOLEAN NOT NULL DEFAULT false;
