import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { withAudit } from '@/lib/audit'
import { withAuditContext } from '@/lib/audit-trail/adapter'
import { withCompanyScope } from '@/lib/company-scope'

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }

  return withCompanyScope(
    withAudit(
      new PrismaClient({
        adapter: withAuditContext(new PrismaPg({ connectionString })),
      }),
    ),
  )
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
