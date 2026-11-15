import { prisma } from '@/lib/prisma'
import type { BalanceAdjustmentKind, BalanceAdjustmentReason } from '@/generated/prisma/enums'

const select = {
  id: true,
  number: true,
  kind: true,
  amount: true,
  adjustedOn: true,
  reason: true,
  note: true,
  createdAt: true,
  channel: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
} as const

export type AdjustmentRow = {
  id: string
  number: string
  kind: BalanceAdjustmentKind
  /** Signed: see adjustments-math.ts for what the sign means per kind. */
  amount: number
  adjustedOn: Date
  reason: BalanceAdjustmentReason
  note: string
  createdAt: Date
  channel: { id: string; name: string } | null
  customer: { id: string; name: string } | null
  createdBy: { name: string } | null
}

type Raw = Omit<AdjustmentRow, 'amount'> & { amount: { toNumber: () => number } }

const shape = (row: Raw): AdjustmentRow => ({ ...row, amount: row.amount.toNumber() })

export async function listAdjustments(filter: {
  search?: string
  kind?: BalanceAdjustmentKind
  reason?: BalanceAdjustmentReason
  from?: string
  to?: string
}): Promise<AdjustmentRow[]> {
  const search = filter.search?.trim()
  const rows = await prisma.balanceAdjustment.findMany({
    where: {
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.reason ? { reason: filter.reason } : {}),
      ...(filter.from || filter.to
        ? {
            adjustedOn: {
              ...(filter.from ? { gte: new Date(`${filter.from}T00:00:00Z`) } : {}),
              ...(filter.to ? { lte: new Date(`${filter.to}T00:00:00Z`) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { note: { contains: search, mode: 'insensitive' } },
              { channel: { name: { contains: search, mode: 'insensitive' } } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ adjustedOn: 'desc' }, { createdAt: 'desc' }],
    select,
  })

  return rows.map(shape)
}

export async function getAdjustment(id: string): Promise<AdjustmentRow | null> {
  const row = await prisma.balanceAdjustment.findUnique({ where: { id }, select })

  return row ? shape(row) : null
}

/** Every adjustment of one customer, oldest first (for the account and statement). */
export async function customerAdjustmentRows(customerId: string): Promise<AdjustmentRow[]> {
  const rows = await prisma.balanceAdjustment.findMany({
    where: { kind: 'CUSTOMER', customerId },
    orderBy: [{ adjustedOn: 'asc' }, { createdAt: 'asc' }],
    select,
  })

  return rows.map(shape)
}
