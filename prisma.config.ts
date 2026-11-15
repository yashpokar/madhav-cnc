import 'dotenv/config'
import { defineConfig } from 'prisma/config'

const migrationUrl =
  process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? ''

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: migrationUrl,
    // Only used by `prisma migrate diff --from-migrations` (CI drift check).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
})
