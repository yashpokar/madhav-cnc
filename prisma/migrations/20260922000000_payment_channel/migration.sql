-- AlterTable
ALTER TABLE "payments" ADD COLUMN "channel_id" TEXT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "payment_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
