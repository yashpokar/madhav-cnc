-- CreateTable
CREATE TABLE "cash_credits" (
    "id" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "source_name" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "notes" TEXT,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_credits_entry_date_idx" ON "cash_credits"("entry_date");

-- AddForeignKey
ALTER TABLE "cash_credits" ADD CONSTRAINT "cash_credits_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
