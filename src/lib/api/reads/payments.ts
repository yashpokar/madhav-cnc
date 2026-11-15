import { prisma } from '@/lib/prisma'
import { keysetClause, type PageArgs } from '@/lib/api/keyset'
import type { Prisma } from '@/generated/prisma/client'
import type { PaymentMode } from '@/generated/prisma/enums'

/**
 * Receipts, newest first, one keyset page. There is no list query for these in
 * src/lib/queries (the web page reads them through getReceivables), so this is
 * the read model for the API. Tenancy comes from the Prisma client, as everywhere.
 */
export async function listPayments({
  search,
  mode,
  from,
  to,
  page,
}: {
  search?: string
  mode?: PaymentMode
  from?: string
  to?: string
  page: PageArgs
}) {
  const term = search?.trim()

  const paidOn: Prisma.PaymentWhereInput['paidOn'] = {
    ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
  }

  return prisma.payment.findMany({
    take: page.take,
    where: {
      AND: keysetClause<Prisma.PaymentWhereInput>(page, 'paidOn', 'desc', 'date'),
      ...(mode ? { mode } : {}),
      ...(from || to ? { paidOn } : {}),
      ...(term
        ? {
            OR: [
              { number: { contains: term, mode: 'insensitive' } },
              { reference: { contains: term, mode: 'insensitive' } },
              { customer: { name: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ paidOn: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      number: true,
      paidOn: true,
      amount: true,
      mode: true,
      modeName: true,
      reference: true,
      orderId: true,
      createdAt: true,
      customer: { select: { id: true, name: true } },
    },
  })
}
