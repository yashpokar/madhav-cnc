CREATE TYPE "ShareDecision" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "CommentAuthorType" AS ENUM ('STAFF', 'CUSTOMER');

CREATE TABLE "quotation_shares" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMP(3),
    "decision" "ShareDecision" NOT NULL DEFAULT 'PENDING',
    "responded_at" TIMESTAMP(3),
    "responded_by_name" TEXT,
    "response_note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_shares_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotation_comments" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "attachment_id" TEXT,
    "body" TEXT NOT NULL,
    "author_type" "CommentAuthorType" NOT NULL,
    "author_user_id" TEXT,
    "author_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_comments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quotation_shares_token_key" ON "quotation_shares"("token");
CREATE INDEX "quotation_shares_quotation_id_idx" ON "quotation_shares"("quotation_id");
CREATE INDEX "quotation_shares_is_revoked_idx" ON "quotation_shares"("is_revoked");
CREATE INDEX "quotation_comments_quotation_id_idx" ON "quotation_comments"("quotation_id");
CREATE INDEX "quotation_comments_attachment_id_idx" ON "quotation_comments"("attachment_id");

ALTER TABLE "quotation_shares" ADD CONSTRAINT "quotation_shares_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_shares" ADD CONSTRAINT "quotation_shares_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_comments" ADD CONSTRAINT "quotation_comments_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_comments" ADD CONSTRAINT "quotation_comments_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "quotation_attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_comments" ADD CONSTRAINT "quotation_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
