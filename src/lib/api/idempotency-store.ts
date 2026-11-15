import { prisma } from '@/lib/prisma'
import { NO_COMPANY } from '@/lib/tenant-rules'
import type { IdempotencyScope, IdempotencyStore, StoredResponse } from '@/lib/api/idempotency'
import type { Prisma } from '@/generated/prisma/client'

// IdempotencyKey is company-scoped, but account-level calls have no company
// ("" ). Every query therefore names its companyId explicitly, which the scope
// layer trusts, instead of relying on the request's active company.

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
}

export const prismaIdempotencyStore: IdempotencyStore = {
  async reserve(scope: IdempotencyScope, request, now) {
    try {
      const row = await prisma.idempotencyKey.create({
        data: {
          userId: scope.userId,
          companyId: scope.companyId,
          key: scope.key,
          method: request.method,
          path: request.path,
          requestHash: request.requestHash,
          createdAt: now,
        },
        select: { id: true },
      })

      return row.id
    } catch (error) {
      if (isUniqueViolation(error)) return null

      throw error
    }
  },

  async find(scope) {
    return prisma.idempotencyKey.findFirst({
      where: { userId: scope.userId, companyId: scope.companyId, key: scope.key },
      select: { id: true, requestHash: true, responseStatus: true, responseBody: true, createdAt: true },
    })
  },

  async complete(id: string, response: StoredResponse) {
    await prisma.idempotencyKey.updateMany({
      where: { id, companyId: { not: NO_COMPANY } },
      data: { responseStatus: response.status, responseBody: response.body as Prisma.InputJsonValue },
    })
  },

  async release(id: string) {
    await prisma.idempotencyKey.deleteMany({ where: { id, companyId: { not: NO_COMPANY } } })
  },

  async deleteExpired(before: Date) {
    const result = await prisma.idempotencyKey.deleteMany({
      where: { createdAt: { lt: before }, companyId: { not: NO_COMPANY } },
    })

    return result.count
  },
}
