import { prisma } from '@/lib/prisma'
import type {
  PurchaseBillStatus,
  PurchaseOrderStatus,
} from '@/generated/prisma/enums'
import {
  balanceDue,
  paymentStatus,
  todayIso,
  type PaymentStatus,
} from '@/lib/purchase-rules'

type DecimalLike = { toNumber: () => number }

const num = (value: DecimalLike) => value.toNumber()
const iso = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)

/** Only a posted bill is owed; drafts and cancelled bills have no payment state. */
function stateOf(
  status: PurchaseBillStatus,
  total: number,
  paid: number,
  dueDate: Date | null,
): PaymentStatus | null {
  if (status !== 'POSTED') return null

  return paymentStatus({ total, paid, dueDate: iso(dueDate), today: todayIso() })
}

export function countBills() {
  return prisma.purchaseBill.count()
}

export async function listBills({
  search,
  status,
}: {
  search?: string
  status?: PurchaseBillStatus
} = {}) {
  const term = search?.trim()

  const bills = await prisma.purchaseBill.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(term
        ? {
            OR: [
              { number: { contains: term, mode: 'insensitive' } },
              { vendorBillNumber: { contains: term, mode: 'insensitive' } },
              { vendor: { name: { contains: term, mode: 'insensitive' } } },
              { po: { number: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      vendorBillNumber: true,
      status: true,
      billDate: true,
      dueDate: true,
      total: true,
      isInterState: true,
      vendor: { select: { id: true, name: true } },
      po: { select: { id: true, number: true } },
      allocations: { select: { amount: true } },
    },
  })

  return bills.map(({ allocations, ...bill }) => {
    const total = num(bill.total)
    const paid = allocations.reduce((sum, row) => sum + num(row.amount), 0)

    return {
      ...bill,
      total,
      paid: Math.round(paid * 100) / 100,
      due: bill.status === 'POSTED' ? balanceDue(total, paid) : 0,
      paymentStatus: stateOf(bill.status, total, paid, bill.dueDate),
    }
  })
}

export async function getBill(id: string) {
  const bill = await prisma.purchaseBill.findUnique({
    where: { id },
    include: {
      vendor: true,
      po: { select: { id: true, number: true } },
      createdBy: { select: { name: true } },
      lines: { orderBy: { id: 'asc' } },
      allocations: {
        orderBy: { id: 'desc' },
        include: { vendorPayment: true },
      },
      receipts: { select: { id: true, number: true } },
    },
  })

  if (!bill) return null

  const total = num(bill.total)
  const paid = bill.allocations.reduce((sum, row) => sum + num(row.amount), 0)

  return {
    ...bill,
    subtotal: num(bill.subtotal),
    discount: num(bill.discount),
    taxableAmount: num(bill.taxableAmount),
    cgst: num(bill.cgst),
    sgst: num(bill.sgst),
    igst: num(bill.igst),
    taxAmount: num(bill.taxAmount),
    roundOff: num(bill.roundOff),
    total,
    paid: Math.round(paid * 100) / 100,
    due: bill.status === 'POSTED' ? balanceDue(total, paid) : 0,
    paymentStatus: stateOf(bill.status, total, paid, bill.dueDate),
    lines: bill.lines.map((line) => ({
      ...line,
      qty: num(line.qty),
      rate: num(line.rate),
      discount: num(line.discount),
      taxRatePercent: num(line.taxRatePercent),
      taxable: num(line.taxable),
      taxAmount: num(line.taxAmount),
      lineTotal: num(line.lineTotal),
    })),
    payments: bill.allocations.map((row) => ({
      id: row.id,
      number: row.vendorPayment.number,
      paidOn: row.vendorPayment.paidOn,
      modeName: row.vendorPayment.modeName ?? row.vendorPayment.mode,
      reference: row.vendorPayment.reference,
      amount: num(row.amount),
    })),
  }
}

export type BillListItem = Awaited<ReturnType<typeof listBills>>[number]
export type BillDetail = NonNullable<Awaited<ReturnType<typeof getBill>>>

export function countPurchaseOrders() {
  return prisma.purchaseOrder.count()
}

export async function listPurchaseOrders({
  search,
  status,
}: {
  search?: string
  status?: PurchaseOrderStatus
} = {}) {
  const term = search?.trim()

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(term
        ? {
            OR: [
              { number: { contains: term, mode: 'insensitive' } },
              { vendor: { name: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      status: true,
      orderDate: true,
      expectedDate: true,
      vendor: { select: { id: true, name: true } },
      lines: { select: { lineTotal: true } },
    },
  })

  return orders.map(({ lines, ...order }) => ({
    ...order,
    total: Math.round(lines.reduce((sum, line) => sum + num(line.lineTotal), 0) * 100) / 100,
    lineCount: lines.length,
  }))
}

export async function getPurchaseOrder(id: string) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: true,
      lines: { orderBy: { sortOrder: 'asc' } },
      bills: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, status: true, total: true },
      },
    },
  })

  if (!order) return null

  const lines = order.lines.map((line) => ({
    ...line,
    qty: num(line.qty),
    receivedQty: num(line.receivedQty),
    rate: num(line.rate),
    taxRatePercent: num(line.taxRatePercent),
    lineTotal: num(line.lineTotal),
  }))

  return {
    ...order,
    lines,
    total: Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100,
    bills: order.bills.map((bill) => ({ ...bill, total: num(bill.total) })),
  }
}

export type OrderListItem = Awaited<ReturnType<typeof listPurchaseOrders>>[number]
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getPurchaseOrder>>>

/** Active vendors for the picker, with the GSTIN so GST can be suggested. */
export async function listPurchaseVendorOptions() {
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      phone: true,
      city: true,
      description: true,
      gstin: true,
    },
  })

  return vendors.map((row) => ({
    id: row.id,
    name: row.name,
    gstin: row.gstin,
    detail:
      [row.phone, row.city].filter(Boolean).join(' · ') || row.description || '',
  }))
}

export type PurchaseVendorOption = Awaited<
  ReturnType<typeof listPurchaseVendorOptions>
>[number]

/** Items and materials a line can point at; the purchase rate when the item has one. */
export async function listPurchasableOptions() {
  const [items, materials] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        rate: true,
        purchaseRate: true,
        taxRatePercent: true,
        hsnCode: true,
      },
    }),
    prisma.material.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
  ])

  return {
    items: items.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      rate: (item.purchaseRate ?? item.rate).toNumber(),
      taxRatePercent: item.taxRatePercent.toNumber(),
      hsnCode: item.hsnCode,
    })),
    materials,
  }
}

export type PurchasableOptions = Awaited<ReturnType<typeof listPurchasableOptions>>

/** A vendor's bills with what is billed and what is still owed (posted bills only). */
export async function vendorPurchases(vendorId: string) {
  const bills = await prisma.purchaseBill.findMany({
    where: { vendorId },
    orderBy: [{ billDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      number: true,
      vendorBillNumber: true,
      status: true,
      billDate: true,
      dueDate: true,
      total: true,
      allocations: { select: { amount: true } },
    },
  })

  const rows = bills.map(({ allocations, ...bill }) => {
    const total = num(bill.total)
    const paid = allocations.reduce((sum, row) => sum + num(row.amount), 0)

    return {
      ...bill,
      total,
      due: bill.status === 'POSTED' ? balanceDue(total, paid) : 0,
      paymentStatus: stateOf(bill.status, total, paid, bill.dueDate),
    }
  })

  return {
    bills: rows,
    billed: Math.round(
      rows.filter((r) => r.status === 'POSTED').reduce((sum, r) => sum + r.total, 0) * 100,
    ) / 100,
    outstanding: Math.round(rows.reduce((sum, r) => sum + r.due, 0) * 100) / 100,
  }
}
