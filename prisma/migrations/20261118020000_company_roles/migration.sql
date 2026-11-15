-- A person can hold a different role in each company. NULL means "use the
-- person's default role", so every existing row keeps behaving as before.
ALTER TABLE "user_companies" ADD COLUMN "role" "UserRole";
