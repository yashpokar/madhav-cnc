CREATE TYPE "ProductionTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'ON_HOLD', 'DONE', 'SKIPPED');

CREATE TABLE "production_stages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_stages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_tasks" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "ProductionTaskStatus" NOT NULL DEFAULT 'PENDING',
    "assigned_to_id" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "production_stages_name_key" ON "production_stages"("name");
CREATE INDEX "production_stages_is_active_idx" ON "production_stages"("is_active");
CREATE UNIQUE INDEX "production_tasks_order_id_stage_id_key" ON "production_tasks"("order_id", "stage_id");
CREATE INDEX "production_tasks_status_idx" ON "production_tasks"("status");
CREATE INDEX "production_tasks_stage_id_idx" ON "production_tasks"("stage_id");
CREATE INDEX "production_tasks_assigned_to_id_idx" ON "production_tasks"("assigned_to_id");

ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "production_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
