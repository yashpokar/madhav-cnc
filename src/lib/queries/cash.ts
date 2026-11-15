import { prisma } from '@/lib/prisma'
import { channelAdjustmentTotal, channelClosingWithAdjustments } from '@/lib/adjustments-math'
import { round2 } from '@/lib/receivables-math'

export type ChannelBalance = {
  channelId: string
  name: string
  isActive: boolean
  /** Null while no opening balance has been entered for this mode. */
  opening: number | null
  asOf: Date | null
  /** Receipts on or after the as-of date. */
  inflow: number
  /** Expenses and vendor payments on or after the as-of date. */
  outflow: number
  /** Signed corrections dated on or after the as-of date (see adjustments-math). */
  adjustments: number
  /** opening + inflow - outflow + adjustments (signed; negative is an overdraft). */
  closing: number | null
}

/** What was entered for each payment mode, for the settings page. */
export async function listOpeningBalances() {
  const [channels, openings] = await Promise.all([
    prisma.paymentChannel.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, isActive: true },
    }),
    prisma.channelOpeningBalance.findMany({
      select: { channelId: true, amount: true, asOf: true },
    }),
  ])

  const byChannel = new Map(openings.map((row) => [row.channelId, row]))

  return channels.map((channel) => {
    const row = byChannel.get(channel.id)

    return {
      ...channel,
      amount: row ? row.amount.toNumber() : null,
      asOf: row?.asOf ?? null,
    }
  })
}

/**
 * Balance per payment mode: the opening amount (signed) plus receipts in, less
 * expenses and vendor payments out, plus signed balance adjustments, counting only entries dated on or after
 * the opening "as of" date, so history from before the system is never
 * counted twice.
 */
export async function getChannelBalances(): Promise<ChannelBalance[]> {
  const rows = await listOpeningBalances()

  return Promise.all(
    rows.map(async (row) => {
      if (row.amount === null || !row.asOf) {
        return {
          channelId: row.id,
          name: row.name,
          isActive: row.isActive,
          opening: null,
          asOf: null,
          inflow: 0,
          outflow: 0,
          adjustments: 0,
          closing: null,
        }
      }

      const since = { gte: row.asOf }

      const [received, spent, paidToVendors, adjusted] = await Promise.all([
        prisma.payment.aggregate({
          where: { channelId: row.id, paidOn: since },
          _sum: { amount: true },
        }),
        prisma.expense.aggregate({
          where: { channelId: row.id, expenseDate: since },
          _sum: { total: true },
        }),
        prisma.vendorPayment.aggregate({
          where: { channelId: row.id, paidOn: since },
          _sum: { amount: true },
        }),
        prisma.balanceAdjustment.findMany({
          where: { kind: 'CHANNEL', channelId: row.id, adjustedOn: since },
          select: { amount: true, adjustedOn: true },
        }),
      ])

      const inflow = round2(received._sum.amount?.toNumber() ?? 0)
      const outflow = round2(
        (spent._sum.total?.toNumber() ?? 0) +
          (paidToVendors._sum.amount?.toNumber() ?? 0),
      )

      // The query already limits to the as-of date; the helper states the rule.
      const adjustments = channelAdjustmentTotal(
        adjusted.map((a) => ({ amount: a.amount.toNumber(), adjustedOn: a.adjustedOn })),
        row.asOf,
      )

      return {
        channelId: row.id,
        name: row.name,
        isActive: row.isActive,
        opening: row.amount,
        asOf: row.asOf,
        inflow,
        outflow,
        adjustments,
        closing: channelClosingWithAdjustments({
          opening: row.amount,
          inflow,
          outflow,
          adjustments,
        }),
      }
    }),
  )
}
