-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_denominations" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_denominations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_tally_counts" (
    "id" TEXT NOT NULL,
    "tally_date" DATE NOT NULL,
    "denomination" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "day_tally_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_tally_banks" (
    "id" TEXT NOT NULL,
    "tally_date" DATE NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "day_tally_banks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_name_key" ON "bank_accounts"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cash_denominations_value_key" ON "cash_denominations"("value");

-- CreateIndex
CREATE UNIQUE INDEX "day_tally_counts_tally_date_denomination_key" ON "day_tally_counts"("tally_date", "denomination");

-- CreateIndex
CREATE UNIQUE INDEX "day_tally_banks_tally_date_bank_account_id_key" ON "day_tally_banks"("tally_date", "bank_account_id");

-- AddForeignKey
ALTER TABLE "day_tally_banks" ADD CONSTRAINT "day_tally_banks_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Starting lists, taken from the sheet the business already uses.
INSERT INTO "bank_accounts" ("id", "name", "sort_order") VALUES
    (gen_random_uuid()::text, 'HDFC', 1),
    (gen_random_uuid()::text, 'SHUBH SBI', 2);

INSERT INTO "cash_denominations" ("id", "value") VALUES
    (gen_random_uuid()::text, 500),
    (gen_random_uuid()::text, 200),
    (gen_random_uuid()::text, 100),
    (gen_random_uuid()::text, 50),
    (gen_random_uuid()::text, 20),
    (gen_random_uuid()::text, 10);
