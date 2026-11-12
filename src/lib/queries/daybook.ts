import { prisma } from '@/lib/prisma'

export async function listBankAccounts(activeOnly = false) {
  return prisma.bankAccount.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, isActive: true },
  })
}

export async function listChannels(activeOnly = false) {
  return prisma.paymentChannel.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      mode: true,
      bankAccountId: true,
      isActive: true,
    },
  })
}

export async function listDenominations(activeOnly = false) {
  return prisma.cashDenomination.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: { value: 'desc' },
    select: { id: true, value: true, isActive: true },
  })
}

/** What was counted and what each bank showed on one day. */
export async function getDayTally(date: Date) {
  const [counts, banks] = await Promise.all([
    prisma.dayTallyCount.findMany({ where: { tallyDate: date } }),
    prisma.dayTallyBank.findMany({ where: { tallyDate: date } }),
  ])

  return {
    counts: Object.fromEntries(counts.map((row) => [row.denomination, row.count])) as Record<
      number,
      number
    >,
    banks: Object.fromEntries(
      banks.map((row) => [row.bankAccountId, row.balance.toNumber()]),
    ) as Record<string, number>,
  }
}

const sum = (value: { toNumber: () => number } | null | undefined) => value?.toNumber() ?? 0

/** Net money in minus money out between two days (after exclusive, upTo inclusive). */
async function movement(after: Date | null, upTo: Date, cash: boolean) {
  const range = { ...(after ? { gt: after } : {}), lte: upTo }
  const mode = cash ? { equals: 'CASH' as const } : { not: 'CASH' as const }

  const [receipts, credits, spent] = await Promise.all([
    prisma.payment.aggregate({ where: { mode, paidOn: range }, _sum: { amount: true } }),
    prisma.cashCredit.aggregate({ where: { mode, entryDate: range }, _sum: { amount: true } }),
    prisma.expense.aggregate({
      where: { paymentMode: mode, expenseDate: range },
      _sum: { total: true },
    }),
  ])

  return sum(receipts._sum.amount) + sum(credits._sum.amount) - sum(spent._sum.total)
}

/**
 * What cash and the banks should add up to at the end of a day: the last day
 * that was counted before it, plus everything received and spent since. Using
 * the last count as the starting point means real opening balances need no
 * set-up. Banks are compared as one total, because entries are not tied to a
 * particular account. With no earlier count there is nothing to compare with.
 */
export async function reconcile(date: Date) {
  const [cashBase, bankBase] = await Promise.all([
    prisma.dayTallyCount.findFirst({
      where: { tallyDate: { lt: date } },
      orderBy: { tallyDate: 'desc' },
      select: { tallyDate: true },
    }),
    prisma.dayTallyBank.findFirst({
      where: { tallyDate: { lt: date } },
      orderBy: { tallyDate: 'desc' },
      select: { tallyDate: true },
    }),
  ])

  async function expected(base: { tallyDate: Date } | null, cash: boolean) {
    if (!base) return { expected: null, since: null }

    const [counted, moved] = await Promise.all([
      cash
        ? prisma.dayTallyCount
            .findMany({ where: { tallyDate: base.tallyDate } })
            .then((rows) => rows.reduce((t, r) => t + r.denomination * r.count, 0))
        : prisma.dayTallyBank
            .aggregate({ where: { tallyDate: base.tallyDate }, _sum: { balance: true } })
            .then((r) => sum(r._sum.balance)),
      movement(base.tallyDate, date, cash),
    ])

    return {
      expected: Math.round((counted + moved) * 100) / 100,
      since: base.tallyDate.toISOString().slice(0, 10),
    }
  }

  const [cash, bank] = await Promise.all([expected(cashBase, true), expected(bankBase, false)])

  return { cash, bank }
}

/** The sign-off for a day, if someone has confirmed it. */
export async function getDayClose(date: Date) {
  const row = await prisma.dayClose.findUnique({
    where: { closeDate: date },
    include: { closedBy: { select: { name: true } } },
  })

  if (!row) return null

  return {
    closedByName: row.closedBy?.name ?? null,
    closedAt: row.closedAt.toISOString(),
    cashCounted: row.cashCounted.toNumber(),
    cashExpected: row.cashExpected?.toNumber() ?? null,
    bankCounted: row.bankCounted.toNumber(),
    bankExpected: row.bankExpected?.toNumber() ?? null,
  }
}
