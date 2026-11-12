-- CreateTable
CREATE TABLE "day_closes" (
    "id" TEXT NOT NULL,
    "close_date" DATE NOT NULL,
    "cash_counted" DECIMAL(14,2) NOT NULL,
    "cash_expected" DECIMAL(14,2),
    "bank_counted" DECIMAL(14,2) NOT NULL,
    "bank_expected" DECIMAL(14,2),
    "closed_by_id" TEXT,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_closes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "day_closes_close_date_key" ON "day_closes"("close_date");

-- AddForeignKey
ALTER TABLE "day_closes" ADD CONSTRAINT "day_closes_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
