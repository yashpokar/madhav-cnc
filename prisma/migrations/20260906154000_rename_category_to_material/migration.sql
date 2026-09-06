ALTER TABLE "item_categories" RENAME TO "materials";

ALTER TABLE "materials" RENAME CONSTRAINT "item_categories_pkey" TO "materials_pkey";
ALTER TABLE "materials" RENAME CONSTRAINT "item_categories_created_by_id_fkey" TO "materials_created_by_id_fkey";

ALTER INDEX "item_categories_name_key" RENAME TO "materials_name_key";
ALTER INDEX "item_categories_is_active_idx" RENAME TO "materials_is_active_idx";

ALTER TABLE "items" RENAME COLUMN "category_id" TO "material_id";
ALTER TABLE "items" RENAME CONSTRAINT "items_category_id_fkey" TO "items_material_id_fkey";
ALTER INDEX "items_category_id_idx" RENAME TO "items_material_id_idx";
