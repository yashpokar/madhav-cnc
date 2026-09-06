ALTER TABLE "production_stages" ADD COLUMN "linked_status" "OrderStatus";

UPDATE "production_stages" SET "linked_status" = 'CONFIRMED' WHERE lower("name") = 'confirmation';
UPDATE "production_stages" SET "linked_status" = 'IN_PRODUCTION' WHERE lower("name") = 'process';
UPDATE "production_stages" SET "linked_status" = 'READY' WHERE lower("name") = 'ready to dispatch';
UPDATE "production_stages" SET "linked_status" = 'DISPATCHED' WHERE lower("name") = 'delivered';
