import { prisma } from '@/lib/prisma'
import {
  agePayables,
  billDue,
  daysOverdue,
  openingPayableRemaining,
  overdueAmount,
  payableStatus,
  round2,
  withRunningBalance,
  advanceAmount,
  type StatementEntry,
} from '@/lib/payables-math'
import { todayIso } from '@/lib/purchase-rules'

type DecimalLike = { toNumber: () => number }

const num = (value: DecimalLike) => value.toNumber()

/** A bill without a due date is due on its bill date. */
const dueOn = (bill: { dueDate: Date | null; billDate: Date }) => bill.dueDate ?? bill.billDate

/**
 * Everything the business owes its vendors: open posted bills plus what is
 * left of each vendor's opening payable, with ageing and a row per vendor.
 * Advances (payments not applied to anything) are shown but not netted off.
 */
export async function getPayables(today: Date = new Date()) {
  const [bills, vendors, payments] = await Promise.all([
    prisma.purchaseBill.findMany({
      where: { status: 'POSTED' },
      select: {
        id: true,
        vendorId: true,
        total: true,
        billDate: true,
        dueDate: true,
        allocations: { select: { amount: true } },
      },
    }),
    prisma.vendor.findMany({
      select: { id: true, name: true, openingPayable: true, openingAsOf: true },
    }),
    prisma.vendorPayment.findMany({
      select: {
        vendorId: true,
        amount: true,
        openingApplied: true,
        allocations: { select: { amount: true } },
      },
    }),
  ])

  type Row = {
    id: string
    name: string
    billed: number
    paid: number
    billDue: number
    opening: number
    due: number
    overdue: number
    oldestDays: number
    openBills: number
    advance: number
  }

  const rows = new Map<string, Row>()
  const items: { due: number; dueOn: Date }[] = []
  const perVendorItems = new Map<string, { due: number; dueOn: Date }[]>()

  for (const vendor of vendors) {
    rows.set(vendor.id, {
      id: vendor.id,
      name: vendor.name,
      billed: 0,
      paid: 0,
      billDue: 0,
      opening: 0,
      due: 0,
      overdue: 0,
      oldestDays: 0,
      openBills: 0,
      advance: 0,
    })
    perVendorItems.set(vendor.id, [])
  }

  for (const bill of bills) {
    const row = rows.get(bill.vendorId)

    if (!row) continue

    const total = num(bill.total)
    const paid = bill.allocations.reduce((sum, a) => sum + num(a.amount), 0)
    const due = billDue(total, paid)

    row.billed = round2(row.billed + total)
    row.paid = round2(row.paid + paid)

    if (due > 0) {
      row.billDue = round2(row.billDue + due)
      row.openBills += 1
      perVendorItems.get(bill.vendorId)!.push({ due, dueOn: dueOn(bill) })
    }
  }

  const appliedToOpening = new Map<string, number>()

  for (const payment of payments) {
    const row = rows.get(payment.vendorId)

    if (!row) continue

    const allocated = payment.allocations.reduce((sum, a) => sum + num(a.amount), 0)
    const opening = num(payment.openingApplied)

    appliedToOpening.set(payment.vendorId, (appliedToOpening.get(payment.vendorId) ?? 0) + opening)
    row.advance = round2(row.advance + advanceAmount(num(payment.amount), allocated, opening))
  }

  for (const vendor of vendors) {
    const row = rows.get(vendor.id)!
    const remaining = openingPayableRemaining(
      num(vendor.openingPayable),
      appliedToOpening.get(vendor.id) ?? 0,
    )

    row.opening = remaining

    // The opening payable is due as of its date; with no date it is not late.
    if (remaining > 0) {
      perVendorItems.get(vendor.id)!.push({
        due: remaining,
        dueOn: vendor.openingAsOf ?? today,
      })
    }

    const own = perVendorItems.get(vendor.id)!

    row.due = round2(row.billDue + remaining)
    row.overdue = overdueAmount(own, today)
    row.oldestDays = own.reduce(
      (max, item) => (item.due > 0 ? Math.max(max, daysOverdue(item.dueOn, today)) : max),
      0,
    )
    items.push(...own)
  }

  const list = [...rows.values()]
    .filter((row) => row.due > 0 || row.advance > 0)
    .sort((a, b) => b.due - a.due || a.name.localeCompare(b.name))

  const sum = (pick: (row: Row) => number) =>
    round2(list.reduce((total, row) => total + pick(row), 0))

  return {
    totalPayable: sum((row) => row.due),
    billsDue: sum((row) => row.billDue),
    openingTotal: sum((row) => row.opening),
    overdue: sum((row) => row.overdue),
    advances: sum((row) => row.advance),
    openBillCount: sum((row) => row.openBills),
    aging: agePayables(items, today),
    vendors: list,
  }
}

export type Payables = Awaited<ReturnType<typeof getPayables>>

/** A vendor's account: bills, payments and a running balance, opening row first. */
export async function getVendorStatement(vendorId: string, today: Date = new Date()) {
  const [vendor, bills, payments] = await Promise.all([
    prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        name: true,
        phone: true,
        gstin: true,
        openingPayable: true,
        openingAsOf: true,
        createdAt: true,
      },
    }),
    prisma.purchaseBill.findMany({
      where: { vendorId, status: 'POSTED' },
      orderBy: [{ billDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        number: true,
        vendorBillNumber: true,
        billDate: true,
        dueDate: true,
        total: true,
        createdAt: true,
        allocations: { select: { amount: true } },
      },
    }),
    prisma.vendorPayment.findMany({
      where: { vendorId },
      orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        number: true,
        paidOn: true,
        amount: true,
        mode: true,
        modeName: true,
        reference: true,
        openingApplied: true,
        createdAt: true,
        allocations: { select: { amount: true } },
      },
    }),
  ])

  if (!vendor) return null

  const openingPayable = num(vendor.openingPayable)
  const openingApplied = round2(payments.reduce((sum, p) => sum + num(p.openingApplied), 0))
  const openingLeft = openingPayableRemaining(openingPayable, openingApplied)

  const openBills = bills
    .map((bill) => {
      const total = num(bill.total)
      const paid = round2(bill.allocations.reduce((sum, a) => sum + num(a.amount), 0))

      return {
        id: bill.id,
        number: bill.number,
        vendorBillNumber: bill.vendorBillNumber,
        billDate: bill.billDate,
        dueDate: bill.dueDate,
        total,
        paid,
        due: billDue(total, paid),
        status: payableStatus({ total, paid, dueDate: bill.dueDate?.toISOString().slice(0, 10) ?? null, today: todayIso(today) }),
      }
    })
    .filter((bill) => bill.due > 0)

  type Entry = StatementEntry & {
    id: string | null
    href: string | null
    label: string
    detail: string
  }

  const entries: Entry[] = []

  if (openingPayable > 0) {
    entries.push({
      kind: 'opening',
      date: vendor.openingAsOf ?? vendor.createdAt,
      order: 0,
      debit: openingPayable,
      credit: 0,
      id: null,
      href: null,
      label: 'Opening payable',
      detail: 'Owed before this system',
    })
  }

  bills.forEach((bill, index) => {
    entries.push({
      kind: 'bill',
      date: bill.billDate,
      order: index,
      debit: num(bill.total),
      credit: 0,
      id: bill.id,
      href: `/purchase-bills/${bill.id}`,
      label: bill.number,
      detail: bill.vendorBillNumber ? `Vendor bill ${bill.vendorBillNumber}` : 'Bill',
    })
  })

  payments.forEach((payment, index) => {
    entries.push({
      kind: 'payment',
      date: payment.paidOn,
      order: index,
      debit: 0,
      credit: num(payment.amount),
      id: payment.id,
      href: `/vendor-payments/${payment.id}`,
      label: payment.number,
      detail: [payment.modeName ?? payment.mode, payment.reference].filter(Boolean).join(' · '),
    })
  })

  const ledger = withRunningBalance(entries)
  const advance = round2(
    payments.reduce(
      (sum, p) =>
        sum +
        advanceAmount(
          num(p.amount),
          p.allocations.reduce((s, a) => s + num(a.amount), 0),
          num(p.openingApplied),
        ),
      0,
    ),
  )
  const items = [
    ...openBills.map((bill) => ({ due: bill.due, dueOn: dueOn(bill) })),
    ...(openingLeft > 0 ? [{ due: openingLeft, dueOn: vendor.openingAsOf ?? today }] : []),
  ]
  const billsDue = round2(openBills.reduce((sum, bill) => sum + bill.due, 0))

  return {
    vendor: { id: vendor.id, name: vendor.name, phone: vendor.phone, gstin: vendor.gstin },
    openBills,
    entries: ledger,
    openingPayable,
    openingAsOf: vendor.openingAsOf,
    openingLeft,
    billsDue,
    due: round2(billsDue + openingLeft),
    advance,
    overdue: overdueAmount(items, today),
    /** What is owed less advances held: the closing balance of the statement. */
    net: ledger.length > 0 ? ledger[ledger.length - 1].balance : 0,
  }
}

export type VendorStatement = NonNullable<Awaited<ReturnType<typeof getVendorStatement>>>
