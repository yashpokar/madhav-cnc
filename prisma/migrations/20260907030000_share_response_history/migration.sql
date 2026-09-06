ALTER TABLE "quotation_shares" ADD COLUMN "amended_at" TIMESTAMP(3);

CREATE TABLE "quotation_share_responses" (
    "id" TEXT NOT NULL,
    "share_id" TEXT NOT NULL,
    "decision" "ShareDecision" NOT NULL,
    "responded_by_name" TEXT,
    "response_note" TEXT,
    "responded_at" TIMESTAMP(3) NOT NULL,
    "superseded_at" TIMESTAMP(3) NOT NULL,
    "superseded_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_share_responses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quotation_share_responses_share_id_idx" ON "quotation_share_responses"("share_id");

ALTER TABLE "quotation_share_responses" ADD CONSTRAINT "quotation_share_responses_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "quotation_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;
