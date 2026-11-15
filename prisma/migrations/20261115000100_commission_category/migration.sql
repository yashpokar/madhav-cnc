-- Commission paid to architects and carpenters, just before "Other".
INSERT INTO "expense_categories" ("id", "name", "sort_order", "is_active", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'Commission', 135, true, now(), now())
ON CONFLICT ("name") DO NOTHING;
