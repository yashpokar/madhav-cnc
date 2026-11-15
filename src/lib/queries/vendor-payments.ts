import { prisma } from '@/lib/prisma'
import type { PaymentMode } from '@/generated/prisma/enums'
import { advanceAmount, billDue, openingPayableRemaining, round2 } from '@/lib/payables-math'

type DecimalLike = { toNumber: () => number }

const num = (value: DecimalLike) => value.toNumber()

/** The reads below also run inside a transaction, so they take the client to use. */
export type Db = Pick<typeof prisma, 'purchaseBill' | 'vendor' | 'vendorPayment'>

export type OpenBill = {
  id: string
  number: string
  vendorBillNumber: string | null
  billDate: Date
  dueDate: Date | null
  total: number
  paid: number
  due: number
}

/**
 * Posted bills of one vendor that still have something to pay, oldest due date
 * first. Pass a payment id to leave that payment's own allocations out (when
 * editing it).
 */
export async function openBillBalances(
  vendorId: string,
  ignorePaymentId?: string,
  db: Db = prisma,
): Promise<OpenBill[]> {
  const bills = await db.purchaseBill.findMany({
    where: { vendorId, status: 'POSTED' },
    orderBy: [{ dueDate: 'asc' }, { billDate: 'asc' }, { number: 'asc' }],
    select: {
      id: true,
      number: true,
      vendorBillNumber: true,
      billDate: true,
      dueDate: true,
      total: true,
      allocations: { select: { amount: true, vendorPaymentId: true } },
    },
  })

  return bills
    .map((bill) => {
      const paid = bill.allocations
        .filter((row) => row.vendorPaymentId !== ignorePaymentId)
        .reduce((sum, row) => sum + num(row.amount), 0)

      return {
        id: bill.id,
        number: bill.number,
        vendorBillNumber: bill.vendorBillNumber,
        billDate: bill.billDate,
        dueDate: bill.dueDate,
        total: num(bill.total),
        paid: round2(paid),
        due: billDue(num(bill.total), paid),
      }
    })
    .filter((bill) => bill.due > 0)
}

/**
 * What is still owed from before the system for one vendor. Pass a payment id
 * to leave that payment's own opening portion out (when editing it).
 */
export async function openingPayableFor(
  vendorId: string,
  ignorePaymentId?: string,
  db: Db = prisma,
) {
  const [vendor, applied] = await Promise.all([
    db.vendor.findUnique({
      where: { id: vendorId },
      select: { openingPayable: true, openingAsOf: true },
    }),
    db.vendorPayment.aggregate({
      where: {
        vendorId,
        ...(ignorePaymentId ? { id: { not: ignorePaymentId } } : {}),
      },
      _sum: { openingApplied: true },
    }),
  ])

  const openingPayable = vendor ? num(vendor.openingPayable) : 0
  const appliedSum = applied._sum.openingApplied ? num(applied._sum.openingApplied) : 0

  return {
    openingPayable,
    asOf: vendor?.openingAsOf ?? null,
    remaining: openingPayableRemaining(openingPayable, appliedSum),
  }
}

export function listVendorsForPicker() {
  return prisma.vendor.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
}

export async function getVendorPayment(id: string) {
  const payment = await prisma.vendorPayment.findUnique({
    where: { id },
    include: {
      vendor: { select: { id: true, name: true, phone: true, gstin: true } },
      recordedBy: { select: { name: true } },
      allocations: {
        orderBy: { id: 'asc' },
        include: {
          bill: {
            select: {
              id: true,
              number: true,
              vendorBillNumber: true,
              billDate: true,
              dueDate: true,
              total: true,
            },
          },
        },
      },
    },
  })

  if (!payment) return null

  const amount = num(payment.amount)
  const openingApplied = num(payment.openingApplied)
  const allocated = round2(
    payment.allocations.reduce((sum, row) => sum + num(row.amount), 0),
  )
  // What this payment could still be applied to, leaving its own portion out.
  const opening = await openingPayableFor(payment.vendorId, payment.id)

  return {
    ...payment,
    amount,
    allocated,
    openingApplied,
    openingLeft: opening.remaining,
    openingAsOf: opening.asOf,
    advance: advanceAmount(amount, allocated, openingApplied),
    allocations: payment.allocations.map((row) => ({
      id: row.id,
      amount: num(row.amount),
      bill: { ...row.bill, total: num(row.bill.total) },
    })),
  }
}

export type VendorPaymentDetail = NonNullable<Awaited<ReturnType<typeof getVendorPayment>>>

export async function listVendorPayments({
  search,
  from,
  to,
  mode,
}: {
  search?: string
  from?: string
  to?: string
  mode?: PaymentMode
} = {}) {
  const term = search?.trim()

  const rows = await prisma.vendorPayment.findMany({
    where: {
      ...(mode ? { mode } : {}),
      ...(from || to
        ? {
            paidOn: {
              ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
              ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
            },
          }
        : {}),
      ...(term
        ? {
            OR: [
              { number: { contains: term, mode: 'insensitive' } },
              { reference: { contains: term, mode: 'insensitive' } },
              { vendor: { name: { contains: term, mode: 'insensitive' } } },
              { modeName: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      number: true,
      paidOn: true,
      amount: true,
      mode: true,
      modeName: true,
      reference: true,
      paymentDetails: true,
      openingApplied: true,
      vendor: { select: { id: true, name: true } },
      allocations: { select: { amount: true, bill: { select: { number: true } } } },
    },
  })

  return rows.map((row) => {
    const amount = num(row.amount)
    const allocated = round2(row.allocations.reduce((sum, a) => sum + num(a.amount), 0))
    const openingApplied = num(row.openingApplied)

    return {
      id: row.id,
      number: row.number,
      paidOn: row.paidOn,
      mode: row.mode,
      modeName: row.modeName,
      reference: row.reference,
      paymentDetails: row.paymentDetails,
      vendor: row.vendor,
      amount,
      allocated,
      openingApplied,
      billNumbers: row.allocations.map((a) => a.bill.number),
      advance: advanceAmount(amount, allocated, openingApplied),
    }
  })
}

export type VendorPaymentRow = Awaited<ReturnType<typeof listVendorPayments>>[number]
