import { prisma } from '@/lib/prisma'
import { keysetClause, type PageArgs } from '@/lib/api/keyset'
import type { CustomerStatus } from '@/generated/prisma/enums'

export async function listCustomers({
  search,
  status,
  page,
}: {
  search?: string
  status?: CustomerStatus
  /** Keyset page (the mobile API); omit for every row. */
  page?: PageArgs
} = {}) {
  const term = search?.trim()

  return prisma.customer.findMany({
    ...(page ? { take: page.take } : {}),
    where: {
      AND: keysetClause(page, 'createdAt', 'desc', 'date'),
      ...(status ? { status } : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { code: { contains: term, mode: 'insensitive' } },
              { phone: { contains: term } },
              { altPhone: { contains: term } },
              { city: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
              { preferredArchitect: { name: { contains: term, mode: 'insensitive' } } },
              { preferredCarpenter: { name: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      status: true,
      phone: true,
      email: true,
      city: true,
      createdAt: true,
      updatedAt: true,
      preferredArchitect: { select: { id: true, name: true } },
      preferredCarpenter: { select: { id: true, name: true } },
    },
  })
}

export async function getCustomer(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    include: {
      preferredArchitect: { select: { id: true, code: true, name: true } },
      preferredCarpenter: { select: { id: true, code: true, name: true } },
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
    },
  })
}

export type CustomerListItem = Awaited<ReturnType<typeof listCustomers>>[number]
export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomer>>>
