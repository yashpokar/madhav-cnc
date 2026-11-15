import type { z } from 'zod'
import { ApiError } from '@/lib/api/errors'
import { DEFAULT_LIMIT, decodeCursor, type CursorPosition } from '@/lib/api/cursor'
import { at, day, dayOrNull, decimal, decimalOrNull, money, paged, stamp } from '@/lib/api/reads/format'
import type * as p from '@/lib/api/schemas/purchasing'
import { getVendor, listVendors } from '@/lib/queries/vendors'
import { getBill, getPurchaseOrder, type BillDetail, type BillListItem, type OrderDetail, type OrderListItem } from '@/lib/queries/purchases'
import { getReceipt, type ReceiptDetail } from '@/lib/queries/goods-receipts'
import { getVendorPayment, type VendorPaymentDetail, type VendorPaymentRow } from '@/lib/queries/vendor-payments'
import type { StockRow } from '@/lib/queries/stock'
import type { Payables, VendorStatement } from '@/lib/queries/payables'

// Database rows become the public JSON shapes of the purchasing endpoints here.
// The web's list queries return every row (a company's purchasing is small), so
// pages are cut in memory with the same opaque cursors as every other list.

type Out<T extends z.ZodType> = z.infer<T>

const missing = (what: string) => new ApiError('NOT_FOUND', `${what} not found.`)

/**
 * One page of an already-loaded list. `rows` must be ordered by (`key`, id) in
 * `dir`; the cursor says where the previous page ended.
 */
export function pageInMemory<T extends { id: string }>(
  rows: T[],
  query: { limit?: number; cursor?: string },
  key: (row: T) => string,
  dir: 'asc' | 'desc',
) {
  const limit = query.limit ?? DEFAULT_LIMIT
  let start = 0

  if (query.cursor) {
    const after = decodeCursor(query.cursor)
    const sign = dir === 'desc' ? -1 : 1
    const ahead = (row: T) => {
      const k = key(row)
      const order = k < String(after.k) ? -1 : k > String(after.k) ? 1 : row.id < after.id ? -1 : row.id > after.id ? 1 : 0

      return order * sign > 0
    }

    start = rows.findIndex(ahead)
    if (start < 0) start = rows.length
  }

  return paged(rows.slice(start, start + limit + 1), limit, (row): CursorPosition => at(key(row), row.id))
}

/** Sorts by (key, id) in one direction so a cursor never repeats or skips a row. */
export function sortedBy<T extends { id: string }>(rows: T[], key: (row: T) => string, dir: 'asc' | 'desc'): T[] {
  const sign = dir === 'desc' ? -1 : 1

  return [...rows].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)

    return (ka < kb ? -1 : ka > kb ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0) * sign
  })
}

// ------------------------------------------------------------------ vendors

type VendorRow = Awaited<ReturnType<typeof listVendors>>[number]

export function vendorListOut(row: VendorRow): Out<typeof p.vendorListItem> {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    gstin: row.gstin,
    address: row.address,
    city: row.city,
    description: row.description,
    isActive: row.isActive,
    openingPayable: money(row.openingPayable.toNumber()),
    openingAsOf: dayOrNull(row.openingAsOf),
    spent: money(row.spent),
    expenseCount: row.bills,
    lastPaidOn: dayOrNull(row.lastPaid),
    updatedAt: stamp(row.updatedAt),
  }
}

type VendorFull = NonNullable<Awaited<ReturnType<typeof getVendor>>>

export function vendorDetailOut(row: VendorFull): Out<typeof p.vendorDetail> {
  return {
    ...vendorListOut({ ...row, lastPaid: row.expenses[0]?.expenseDate ?? null }),
    createdAt: stamp(row.createdAt),
    recentExpenses: row.expenses.map((e) => ({
      id: e.id,
      number: e.number,
      expenseDate: day(e.expenseDate),
      description: e.description,
      modeName: e.modeName ?? e.channel?.name ?? null,
      total: money(e.total),
    })),
  }
}

export async function vendorDetailFor(id: string) {
  const row = await getVendor(id)

  if (!row) throw missing('Vendor')

  return vendorDetailOut(row)
}

export function vendorStatementOut(s: VendorStatement): Out<typeof p.vendorStatement> {
  return {
    vendor: s.vendor,
    openingPayable: money(s.openingPayable),
    openingAsOf: dayOrNull(s.openingAsOf),
    openingLeft: money(s.openingLeft),
    billsDue: money(s.billsDue),
    due: money(s.due),
    advance: money(s.advance),
    overdue: money(s.overdue),
    net: money(s.net),
    openBills: s.openBills.map((b) => ({
      id: b.id,
      number: b.number,
      vendorBillNumber: b.vendorBillNumber,
      billDate: day(b.billDate),
      dueDate: dayOrNull(b.dueDate),
      total: money(b.total),
      paid: money(b.paid),
      due: money(b.due),
      status: String(b.status),
    })),
    entries: s.entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      date: day(e.date),
      label: e.label,
      detail: e.detail,
      debit: money(e.debit),
      credit: money(e.credit),
      balance: money(e.balance),
    })),
  }
}

export function payablesOut(r: Payables): Out<typeof p.payablesResponse> {
  return {
    totalPayable: money(r.totalPayable),
    billsDue: money(r.billsDue),
    openingTotal: money(r.openingTotal),
    overdue: money(r.overdue),
    advances: money(r.advances),
    openBillCount: r.openBillCount,
    aging: r.aging.map((b) => ({ key: String(b.key), label: b.label, amount: money(b.amount), count: b.count })),
    vendors: r.vendors.map((v) => ({
      id: v.id,
      name: v.name,
      billed: money(v.billed),
      paid: money(v.paid),
      billDue: money(v.billDue),
      opening: money(v.opening),
      due: money(v.due),
      overdue: money(v.overdue),
      oldestDays: v.oldestDays,
      advance: money(v.advance),
      openBills: v.openBills,
    })),
  }
}

// ----------------------------------------------------------- purchase orders

export function purchaseOrderListOut(row: OrderListItem): Out<typeof p.purchaseOrderListItem> {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    orderDate: day(row.orderDate),
    expectedDate: dayOrNull(row.expectedDate),
    vendor: row.vendor,
    total: money(row.total),
    lineCount: row.lineCount,
    updatedAt: stamp(row.updatedAt),
  }
}

export function purchaseOrderDetailOut(row: OrderDetail): Out<typeof p.purchaseOrderDetail> {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    orderDate: day(row.orderDate),
    expectedDate: dayOrNull(row.expectedDate),
    vendor: { id: row.vendor.id, name: row.vendor.name },
    total: money(row.total),
    lineCount: row.lines.length,
    notes: row.notes,
    lines: row.lines.map((l) => ({
      id: l.id,
      itemId: l.itemId,
      materialId: l.materialId,
      description: l.description,
      qty: decimal(l.qty),
      receivedQty: decimal(l.receivedQty),
      unit: l.unit,
      rate: money(l.rate),
      taxRatePercent: decimal(l.taxRatePercent),
      lineTotal: money(l.lineTotal),
    })),
    bills: row.bills.map((b) => ({ id: b.id, number: b.number, status: b.status, total: money(b.total) })),
    createdAt: stamp(row.createdAt),
    updatedAt: stamp(row.updatedAt),
  }
}

export async function purchaseOrderDetailFor(id: string) {
  const row = await getPurchaseOrder(id)

  if (!row) throw missing('Purchase order')

  return purchaseOrderDetailOut(row)
}

// ------------------------------------------------------------ purchase bills

export function purchaseBillListOut(row: BillListItem): Out<typeof p.purchaseBillListItem> {
  return {
    id: row.id,
    number: row.number,
    vendorBillNumber: row.vendorBillNumber,
    status: row.status,
    billDate: day(row.billDate),
    dueDate: dayOrNull(row.dueDate),
    isInterState: row.isInterState,
    total: money(row.total),
    paid: money(row.paid),
    due: money(row.due),
    paymentStatus: row.paymentStatus,
    vendor: row.vendor,
    purchaseOrder: row.po,
    updatedAt: stamp(row.updatedAt),
  }
}

export function purchaseBillDetailOut(row: BillDetail): Out<typeof p.purchaseBillDetail> {
  return {
    id: row.id,
    number: row.number,
    vendorBillNumber: row.vendorBillNumber,
    status: row.status,
    billDate: day(row.billDate),
    dueDate: dayOrNull(row.dueDate),
    isInterState: row.isInterState,
    total: money(row.total),
    paid: money(row.paid),
    due: money(row.due),
    paymentStatus: row.paymentStatus,
    vendor: { id: row.vendor.id, name: row.vendor.name },
    purchaseOrder: row.po,
    notes: row.notes,
    subtotal: money(row.subtotal),
    discount: money(row.discount),
    taxableAmount: money(row.taxableAmount),
    cgst: money(row.cgst),
    sgst: money(row.sgst),
    igst: money(row.igst),
    taxAmount: money(row.taxAmount),
    roundOff: money(row.roundOff),
    lines: row.lines.map((l) => ({
      id: l.id,
      poLineId: l.poLineId,
      itemId: l.itemId,
      materialId: l.materialId,
      description: l.description,
      hsnCode: l.hsnCode,
      qty: decimal(l.qty),
      unit: l.unit,
      rate: money(l.rate),
      discount: money(l.discount),
      taxRatePercent: decimal(l.taxRatePercent),
      taxable: money(l.taxable),
      taxAmount: money(l.taxAmount),
      lineTotal: money(l.lineTotal),
    })),
    payments: row.payments.map((x) => ({
      id: x.id,
      paymentId: x.paymentId,
      number: x.number,
      paidOn: day(x.paidOn),
      modeName: x.modeName,
      reference: x.reference,
      amount: money(x.amount),
    })),
    receipts: row.receipts.map((r) => ({ id: r.id, number: r.number, status: r.status, receivedOn: day(r.receivedOn) })),
    createdAt: stamp(row.createdAt),
    updatedAt: stamp(row.updatedAt),
  }
}

export async function purchaseBillDetailFor(id: string) {
  const row = await getBill(id)

  if (!row) throw missing('Purchase bill')

  return purchaseBillDetailOut(row)
}

// ------------------------------------------------------------ goods receipts

type ReceiptListRow = {
  id: string
  number: string
  status: ReceiptDetail['status']
  receivedOn: Date
  createdAt: Date
  vendor: { id: string; name: string }
  bill: { id: string; number: string } | null
  po: { id: string; number: string } | null
  _count: { lines: number }
}

export function goodsReceiptListOut(row: ReceiptListRow): Out<typeof p.goodsReceiptListItem> {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    receivedOn: day(row.receivedOn),
    vendor: row.vendor,
    bill: row.bill,
    purchaseOrder: row.po,
    lineCount: row._count.lines,
    // A receipt has no edit stamp; its cancellation changes the status only, so the recorded time stands in.
    updatedAt: stamp(row.createdAt),
  }
}

export function goodsReceiptDetailOut(row: ReceiptDetail): Out<typeof p.goodsReceiptDetail> {
  return {
    ...goodsReceiptListOut({ ...row, _count: { lines: row.lines.length } }),
    notes: row.notes,
    lines: row.lines.map((l) => ({
      id: l.id,
      itemId: l.itemId,
      materialId: l.materialId,
      name: l.name,
      code: l.code,
      unit: l.unit,
      qty: decimal(l.qty),
      unitCost: l.unitCost.toFixed(4),
      tracked: l.tracked,
    })),
    createdAt: stamp(row.createdAt),
  }
}

export async function goodsReceiptDetailFor(id: string) {
  const row = await getReceipt(id)

  if (!row) throw missing('Goods receipt')

  return goodsReceiptDetailOut(row)
}

// ----------------------------------------------------------- vendor payments

export function vendorPaymentListOut(row: VendorPaymentRow & { createdAt: Date }): Out<typeof p.vendorPaymentListItem> {
  return {
    id: row.id,
    number: row.number,
    paidOn: day(row.paidOn),
    amount: money(row.amount),
    allocated: money(row.allocated),
    openingApplied: money(row.openingApplied),
    advance: money(row.advance),
    mode: row.mode,
    modeName: row.modeName,
    reference: row.reference,
    vendor: row.vendor,
    billNumbers: row.billNumbers,
    updatedAt: stamp(row.createdAt),
  }
}

const jsonObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

export function vendorPaymentDetailOut(row: VendorPaymentDetail): Out<typeof p.vendorPaymentDetail> {
  return {
    id: row.id,
    number: row.number,
    paidOn: day(row.paidOn),
    amount: money(row.amount),
    allocated: money(row.allocated),
    openingApplied: money(row.openingApplied),
    advance: money(row.advance),
    mode: row.mode,
    modeName: row.modeName,
    reference: row.reference,
    vendor: { id: row.vendor.id, name: row.vendor.name },
    notes: row.notes,
    paymentDetails: jsonObject(row.paymentDetails),
    openingLeft: money(row.openingLeft),
    allocations: row.allocations.map((a) => ({
      id: a.id,
      amount: money(a.amount),
      bill: {
        id: a.bill.id,
        number: a.bill.number,
        vendorBillNumber: a.bill.vendorBillNumber,
        billDate: day(a.bill.billDate),
        dueDate: dayOrNull(a.bill.dueDate),
        total: money(a.bill.total),
      },
    })),
    createdAt: stamp(row.createdAt),
    updatedAt: stamp(row.createdAt),
  }
}

export async function vendorPaymentDetailFor(id: string) {
  const row = await getVendorPayment(id)

  if (!row) throw missing('Vendor payment')

  return vendorPaymentDetailOut(row)
}

// --------------------------------------------------------------------- stock

export function stockListOut(row: StockRow): Out<typeof p.stockListItem> {
  return {
    kind: row.kind,
    id: row.id,
    name: row.name,
    code: row.code,
    unit: row.unit,
    onHand: decimal(row.onHand),
    averageCost: decimal(row.averageCost),
    value: money(row.value),
    reorderLevel: decimalOrNull(row.reorderLevel),
    state: row.state,
  }
}
