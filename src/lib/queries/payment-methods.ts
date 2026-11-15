import { prisma } from '@/lib/prisma'
import { modeText } from '@/lib/payment-modes'

export type MethodEntry = {
  id: string
  kind: 'in' | 'out'
  date: Date
  number: string
  party: string
  amount: number
}

export type MethodGroup = {
  name: string
  received: number
  receivedCount: number
  spent: number
  spentCount: number
  net: number
  entries: MethodEntry[]
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** Inclusive yyyy-mm-dd bounds as @db.Date-safe UTC dates. */
function bounds(from: string, to: string) {
  return {
    gte: new Date(`${from}T00:00:00.000Z`),
    lte: new Date(`${to}T00:00:00.000Z`),
  }
}

/**
 * Receipts and (optionally) expenses in a date range, grouped by how they were
 * paid: the payment mode name as recorded, else the kind's label.
 */
export async function paymentsByMethod(
  range: { from: string; to: string },
  includeExpenses: boolean,
) {
  const dates = bounds(range.from, range.to)

  const [payments, expenses] = await Promise.all([
    prisma.payment.findMany({
      where: { paidOn: dates },
      select: {
        id: true,
        number: true,
        paidOn: true,
        amount: true,
        mode: true,
        modeName: true,
        customer: { select: { name: true } },
      },
      orderBy: [{ paidOn: 'desc' }, { number: 'desc' }],
    }),
    includeExpenses
      ? prisma.expense.findMany({
          where: { expenseDate: dates },
          select: {
            id: true,
            number: true,
            expenseDate: true,
            total: true,
            paymentMode: true,
            modeName: true,
            payeeName: true,
          },
          orderBy: [{ expenseDate: 'desc' }, { number: 'desc' }],
        })
      : Promise.resolve([]),
  ])

  const groups = new Map<string, MethodGroup>()
  const group = (name: string) => {
    let found = groups.get(name)

    if (!found) {
      found = { name, received: 0, receivedCount: 0, spent: 0, spentCount: 0, net: 0, entries: [] }
      groups.set(name, found)
    }

    return found
  }

  for (const p of payments) {
    const g = group(modeText(p) || 'Unspecified')
    const amount = p.amount.toNumber()

    g.received = round2(g.received + amount)
    g.receivedCount += 1
    g.entries.push({ id: p.id, kind: 'in', date: p.paidOn, number: p.number, party: p.customer.name, amount })
  }

  for (const e of expenses) {
    const g = group(modeText(e) || 'Unspecified')
    const amount = e.total.toNumber()

    g.spent = round2(g.spent + amount)
    g.spentCount += 1
    g.entries.push({ id: e.id, kind: 'out', date: e.expenseDate, number: e.number, party: e.payeeName, amount })
  }

  const list = [...groups.values()].map((g) => ({
    ...g,
    net: round2(g.received - g.spent),
    entries: g.entries.sort((a, b) => b.date.getTime() - a.date.getTime()),
  }))

  list.sort((a, b) => b.received + b.spent - (a.received + a.spent))

  const totals = list.reduce(
    (t, g) => ({
      received: round2(t.received + g.received),
      receivedCount: t.receivedCount + g.receivedCount,
      spent: round2(t.spent + g.spent),
      spentCount: t.spentCount + g.spentCount,
    }),
    { received: 0, receivedCount: 0, spent: 0, spentCount: 0 },
  )

  return { groups: list, totals: { ...totals, net: round2(totals.received - totals.spent) } }
}
