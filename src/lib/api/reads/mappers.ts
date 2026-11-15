import type { z } from 'zod'
import {
  day,
  dayOrNull,
  decimal,
  decimalOrNull,
  money,
  moneyOrNull,
  stamp,
  stampOrNull,
  todayIndia,
} from '@/lib/api/reads/format'
import type {
  customerAccountSummary,
  customerDetail,
  customerListItem,
  expenseDetail,
  expenseListItem,
  invoiceDetail,
  invoiceListItem,
  itemDetail,
  itemListItem,
  orderDetail,
  orderListItem,
  paymentDetail,
  paymentListItem,
  productionTask,
  quotationDetail,
  quotationListItem,
} from '@/lib/api/schemas/reads'
import type { CustomerAccount } from '@/lib/queries/payments'
import type { CustomerDetail, CustomerListItem } from '@/lib/queries/customers'
import type { ItemListItem } from '@/lib/queries/items'
import type { OrderDetail, OrderListItem } from '@/lib/queries/orders'
import type { QuotationDetail, QuotationListItem } from '@/lib/queries/quotations'
import type { InvoiceDetail, InvoiceListItem } from '@/lib/queries/invoices'
import type { ExpenseDetail, ExpenseListItem } from '@/lib/queries/accounting'
import type { BoardTask } from '@/lib/queries/production'
import { summariseMaterial } from '@/lib/queries/quotations'

// The one place a database row becomes a public JSON shape. Each mapper names
// every field it returns, so a new column never leaks by accident (share
// tokens, internal user names and storage keys are deliberately absent).

type Out<T extends z.ZodType> = z.infer<T>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const jsonObject = (value: unknown): Record<string, unknown> | null => (isRecord(value) ? value : null)

// ----------------------------------------------------------------- customers

export function customerListOut(row: CustomerListItem): Out<typeof customerListItem> {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    status: row.status,
    phone: row.phone,
    email: row.email,
    city: row.city,
    preferredArchitect: row.preferredArchitect,
    preferredCarpenter: row.preferredCarpenter,
    createdAt: stamp(row.createdAt),
    updatedAt: stamp(row.updatedAt),
  }
}

export function accountOut(account: CustomerAccount): Out<typeof customerAccountSummary> {
  return {
    outstanding: money(account.due),
    invoiceDue: money(account.invoiceDue),
    opening: money(account.opening),
    onAccount: money(account.onAccount),
    credit: money(account.credit),
    creditNotes: money(account.creditNotesTotal),
    net: money(account.net),
    openInvoices: account.invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      invoiceDate: day(invoice.invoiceDate),
      dueDate: dayOrNull(invoice.dueDate),
      total: money(invoice.total),
      due: money(invoice.due),
    })),
  }
}

export function customerDetailOut(
  row: NonNullable<CustomerDetail>,
  account: CustomerAccount | null,
): Out<typeof customerDetail> {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    status: row.status,
    phone: row.phone,
    email: row.email,
    city: row.city,
    preferredArchitect: row.preferredArchitect ? { id: row.preferredArchitect.id, name: row.preferredArchitect.name } : null,
    preferredCarpenter: row.preferredCarpenter ? { id: row.preferredCarpenter.id, name: row.preferredCarpenter.name } : null,
    createdAt: stamp(row.createdAt),
    updatedAt: stamp(row.updatedAt),
    altPhone: row.altPhone,
    address: row.address,
    state: row.state,
    pincode: row.pincode,
    gstin: row.gstin,
    pan: row.pan,
    dateOfBirth: dayOrNull(row.dateOfBirth),
    anniversaryDate: dayOrNull(row.anniversaryDate),
    paymentTermsDays: row.paymentTermsDays,
    notes: row.notes,
    openingDue: money(row.openingDue.toNumber()),
    openingAsOf: dayOrNull(row.openingAsOf),
    account: account ? accountOut(account) : null,
  }
}

// --------------------------------------------------------------------- items

export function itemListOut(row: ItemListItem): Out<typeof itemListItem> {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    supplyType: row.supplyType,
    isFlatRate: row.isFlatRate,
    unit: row.unit,
    rate: money(row.rate),
    taxRatePercent: money(row.taxRatePercent),
    brand: row.brand,
    dimensionUnit: row.dimensionUnit,
    thickness: decimalOrNull(row.thickness),
    isActive: row.isActive,
    material: row.material,
    updatedAt: stamp(row.updatedAt),
  }
}

type ItemRow = NonNullable<Awaited<ReturnType<typeof import('@/lib/queries/items').getItem>>>

export function itemDetailOut(row: ItemRow, canSeePurchase: boolean): Out<typeof itemDetail> {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    supplyType: row.supplyType,
    isFlatRate: row.isFlatRate,
    unit: row.unit,
    rate: money(row.rate),
    taxRatePercent: money(row.taxRatePercent),
    brand: row.brand,
    dimensionUnit: row.dimensionUnit,
    thickness: decimalOrNull(row.thickness),
    isActive: row.isActive,
    material: row.material,
    updatedAt: stamp(row.updatedAt),
    description: row.description,
    shade: row.shade,
    length: decimalOrNull(row.length),
    width: decimalOrNull(row.width),
    hsnCode: row.hsnCode,
    notes: row.notes,
    stockTracked: row.stockTracked,
    purchaseRate: canSeePurchase ? moneyOrNull(row.purchaseRate) : null,
    reorderLevel: decimalOrNull(row.reorderLevel),
    createdAt: stamp(row.createdAt),
  }
}

// --------------------------------------------------------------------- lines

type DocLine = {
  id: string
  position: number
  itemId: string | null
  description: string
  unit: string
  materialSupply: 'WITH_MATERIAL' | 'WITHOUT_MATERIAL'
  isFlatRate: boolean
  dimensionUnit: 'MM' | 'INCH' | 'FT' | null
  length: number | null
  width: number | null
  pieces: number | null
  quantity: number
  rate: number
  discountPercent: number
  taxRatePercent: number
  amount: number
  taxAmount: number
  lineTotal: number
}

function lineOut(line: DocLine) {
  return {
    id: line.id,
    position: line.position,
    itemId: line.itemId,
    description: line.description,
    unit: line.unit,
    materialSupply: line.materialSupply,
    isFlatRate: line.isFlatRate,
    dimensionUnit: line.dimensionUnit,
    length: decimalOrNull(line.length),
    width: decimalOrNull(line.width),
    pieces: decimalOrNull(line.pieces),
    quantity: decimal(line.quantity),
    rate: money(line.rate),
    discountPercent: decimal(line.discountPercent),
    taxRatePercent: decimal(line.taxRatePercent),
    amount: money(line.amount),
    taxAmount: money(line.taxAmount),
    lineTotal: money(line.lineTotal),
  }
}

function totalsOut(doc: {
  discountType: string
  discountValue: number
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxAmount: number
  roundOff: number
  total: number
}) {
  return {
    discountType: doc.discountType,
    discountValue: money(doc.discountValue),
    subtotal: money(doc.subtotal),
    discountAmount: money(doc.discountAmount),
    taxableAmount: money(doc.taxableAmount),
    taxAmount: money(doc.taxAmount),
    roundOff: money(doc.roundOff),
    total: money(doc.total),
  }
}

// ---------------------------------------------------------------- quotations

export function quotationListOut(row: QuotationListItem): Out<typeof quotationListItem> {
  return {
    id: row.id,
    number: row.number,
    revision: row.revision,
    status: row.status,
    subject: row.subject,
    quotationDate: day(row.quotationDate),
    validUntil: dayOrNull(row.validUntil),
    total: money(row.total),
    materialSummary: row.materialSummary,
    lineCount: row._count.lines,
    customer: row.customer,
    architect: row.architect?.name ?? null,
    carpenter: row.carpenter?.name ?? null,
    updatedAt: stamp(row.updatedAt),
  }
}

export function quotationDetailOut(row: NonNullable<QuotationDetail>): Out<typeof quotationDetail> {
  const share = row.shares[0]

  return {
    id: row.id,
    number: row.number,
    revision: row.revision,
    status: row.status,
    subject: row.subject,
    quotationDate: day(row.quotationDate),
    validUntil: dayOrNull(row.validUntil),
    total: money(row.total),
    materialSummary: summariseMaterial(row.lines),
    lineCount: row.lines.length,
    customer: { id: row.customer.id, code: row.customer.code, name: row.customer.name },
    architect: row.architect?.name ?? null,
    carpenter: row.carpenter?.name ?? null,
    updatedAt: stamp(row.updatedAt),
    siteAddress: row.siteAddress,
    siteCity: row.siteCity,
    sitePincode: row.sitePincode,
    advancePercent: decimal(row.advancePercent),
    notes: row.notes,
    terms: row.terms,
    totals: totalsOut(row),
    lines: row.lines.map(lineOut),
    order: row.orders[0] ? { id: row.orders[0].id, number: row.orders[0].number } : null,
    share: {
      hasLink: Boolean(share),
      decision: share?.decision ?? null,
      viewCount: share?.viewCount ?? 0,
      lastViewedAt: stampOrNull(share?.lastViewedAt),
      respondedAt: stampOrNull(share?.respondedAt),
      respondedByName: share?.respondedByName ?? null,
      responseNote: share?.responseNote ?? null,
    },
    createdAt: stamp(row.createdAt),
  }
}

// -------------------------------------------------------------------- orders

export function orderListOut(row: OrderListItem): Out<typeof orderListItem> {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    subject: row.subject,
    orderDate: day(row.orderDate),
    dueDate: dayOrNull(row.dueDate),
    startsAt: stampOrNull(row.startsAt),
    endsAt: stampOrNull(row.endsAt),
    total: money(row.total),
    advanceAmount: money(row.advanceAmount),
    balance: money(Math.max(row.total - row.advanceAmount, 0)),
    materialSummary: row.materialSummary,
    lineCount: row._count.lines,
    customer: row.customer,
    architect: row.architect?.name ?? null,
    quotation: row.quotation,
    updatedAt: stamp(row.updatedAt),
  }
}

export function orderDetailOut(row: NonNullable<OrderDetail>): Out<typeof orderDetail> {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    subject: row.subject,
    orderDate: day(row.orderDate),
    dueDate: dayOrNull(row.dueDate),
    startsAt: stampOrNull(row.startsAt),
    endsAt: stampOrNull(row.endsAt),
    total: money(row.total),
    advanceAmount: money(row.advanceAmount),
    balance: money(Math.max(row.total - row.advanceAmount, 0)),
    materialSummary: summariseMaterial(row.lines),
    lineCount: row.lines.length,
    customer: { id: row.customer.id, code: row.customer.code, name: row.customer.name },
    architect: row.architect?.name ?? null,
    quotation: row.quotation ? { id: row.quotation.id, number: row.quotation.number } : null,
    updatedAt: stamp(row.updatedAt),
    customerPoNumber: row.customerPoNumber,
    venue: row.venue,
    headcount: row.headcount,
    siteAddress: row.siteAddress,
    siteCity: row.siteCity,
    sitePincode: row.sitePincode,
    transportCharge: money(row.transportCharge),
    transportTaxRatePercent: decimal(row.transportTaxRatePercent),
    notes: row.notes,
    terms: row.terms,
    totals: totalsOut(row),
    lines: row.lines.map(lineOut),
    carpenter: row.carpenter?.name ?? null,
    createdAt: stamp(row.createdAt),
  }
}

// ------------------------------------------------------------------ invoices

type InvoiceListRow = InvoiceListItem

function isOverdue(row: { status: string; due: number; dueDate: Date | null }): boolean {
  return row.status === 'ISSUED' && row.due > 0 && row.dueDate !== null && row.dueDate.getTime() < todayIndia().getTime()
}

export function invoiceListOut(row: InvoiceListRow): Out<typeof invoiceListItem> {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    invoiceDate: day(row.invoiceDate),
    dueDate: dayOrNull(row.dueDate),
    total: money(row.total),
    advanceAdjusted: money(row.advanceAdjusted),
    paid: money(row.paid),
    writtenOff: money(row.writtenOff),
    due: money(row.due),
    paymentState: row.paymentState,
    isOverdue: isOverdue(row),
    isInterState: row.isInterState,
    customer: row.customer,
    order: row.order,
    updatedAt: stamp(row.updatedAt),
  }
}

export function invoiceDetailOut(row: NonNullable<InvoiceDetail>): Out<typeof invoiceDetail> {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    invoiceDate: day(row.invoiceDate),
    dueDate: dayOrNull(row.dueDate),
    total: money(row.total),
    advanceAdjusted: money(row.advanceAdjusted),
    paid: money(row.paid),
    writtenOff: money(row.writtenOff),
    due: money(row.due),
    paymentState: row.paymentState,
    isOverdue: isOverdue(row),
    isInterState: row.isInterState,
    customer: { id: row.customer.id, name: row.customer.name },
    order: row.order ? { id: row.order.id, number: row.order.number } : null,
    updatedAt: stamp(row.updatedAt),
    placeOfSupply: row.placeOfSupply,
    billingAddress: row.billingAddress,
    customerGstin: row.customerGstin,
    notes: row.notes,
    terms: row.terms,
    gst: {
      taxableAmount: money(row.taxableAmount),
      cgstAmount: money(row.cgstAmount),
      sgstAmount: money(row.sgstAmount),
      igstAmount: money(row.igstAmount),
      taxAmount: money(row.taxAmount),
    },
    totals: { ...totalsOut(row), transportCharge: money(row.transportCharge) },
    lines: row.lines.map((line) => ({
      id: line.id,
      position: line.position,
      description: line.description,
      hsnCode: line.hsnCode,
      unit: line.unit,
      quantity: decimal(line.quantity),
      rate: money(line.rate),
      discountPercent: decimal(line.discountPercent),
      taxRatePercent: decimal(line.taxRatePercent),
      amount: money(line.amount),
      cgstAmount: money(line.cgstAmount),
      sgstAmount: money(line.sgstAmount),
      igstAmount: money(line.igstAmount),
      lineTotal: money(line.lineTotal),
    })),
    payments: row.payments.map((payment) => ({
      paymentId: payment.paymentId,
      number: payment.number,
      paidOn: day(payment.paidOn),
      mode: payment.mode,
      reference: payment.reference,
      amount: money(payment.amount),
    })),
    writeOffs: row.writeOffs.map((writeOff) => ({
      id: writeOff.id,
      amount: money(writeOff.amount),
      reason: String(writeOff.reason),
      writtenOffOn: day(writeOff.writtenOffOn),
    })),
    createdAt: stamp(row.createdAt),
  }
}

// ------------------------------------------------------------------ payments

type PaymentListRow = {
  id: string
  number: string
  paidOn: Date
  amount: { toNumber: () => number }
  mode: Out<typeof paymentListItem>['mode']
  modeName: string | null
  reference: string | null
  orderId: string | null
  createdAt: Date
  customer: { id: string; name: string }
}

export function paymentListOut(row: PaymentListRow): Out<typeof paymentListItem> {
  return {
    id: row.id,
    number: row.number,
    paidOn: day(row.paidOn),
    amount: money(row.amount.toNumber()),
    mode: row.mode,
    modeName: row.modeName,
    reference: row.reference,
    isAdvance: Boolean(row.orderId),
    customer: { id: row.customer.id, name: row.customer.name },
    updatedAt: stamp(row.createdAt),
  }
}

type ReceiptRow = NonNullable<Awaited<ReturnType<typeof import('@/lib/queries/payments').getReceipt>>>

export function paymentDetailOut(row: ReceiptRow): Out<typeof paymentDetail> {
  return {
    ...paymentListOut({ ...row, amount: { toNumber: () => row.amount } }),
    notes: row.notes,
    paymentDetails: jsonObject(row.paymentDetails),
    allocated: money(row.allocated),
    openingApplied: money(row.openingApplied),
    unallocated: money(row.unallocated),
    orderId: row.orderId,
    allocations: row.allocations.map((allocation) => ({
      id: allocation.id,
      amount: money(allocation.amount),
      invoice: {
        id: allocation.invoice.id,
        number: allocation.invoice.number,
        total: money(allocation.invoice.total),
      },
    })),
    createdAt: stamp(row.createdAt),
  }
}

// ------------------------------------------------------------------ expenses

export function expenseListOut(row: ExpenseListItem): Out<typeof expenseListItem> {
  return {
    id: row.id,
    number: row.number,
    expenseDate: day(row.expenseDate),
    payeeName: row.payeeName,
    description: row.description,
    amount: money(row.amount),
    taxAmount: money(row.taxAmount),
    total: money(row.total),
    isInputCredit: row.isInputCredit,
    paymentMode: row.paymentMode,
    modeName: row.modeName,
    reference: row.reference,
    billNumber: row.billNumber,
    category: row.category,
    order: row.order,
    updatedAt: stamp(row.updatedAt),
  }
}

export function expenseDetailOut(row: NonNullable<ExpenseDetail>): Out<typeof expenseDetail> {
  return {
    id: row.id,
    number: row.number,
    expenseDate: day(row.expenseDate),
    payeeName: row.payeeName,
    description: row.description,
    amount: money(row.amount),
    taxAmount: money(row.taxAmount),
    total: money(row.total),
    isInputCredit: row.isInputCredit,
    paymentMode: row.paymentMode,
    modeName: row.modeName,
    reference: row.reference,
    billNumber: row.billNumber,
    category: row.category,
    order: row.order,
    updatedAt: stamp(row.updatedAt),
    taxRatePercent: decimal(row.taxRatePercent),
    vendorGstin: row.vendorGstin,
    notes: row.notes,
    paymentDetails: jsonObject(row.paymentDetails),
    receiptUploadId: row.receiptUploadId,
    createdAt: stamp(row.createdAt),
  }
}

// ---------------------------------------------------------------- production

/** The part of a board row the wire shape needs (so one task can be read without the board's extras). */
export type TaskRow = Omit<BoardTask, 'order'> & {
  order: Omit<BoardTask['order'], 'lines' | 'productionTasks'>
}

export function productionTaskOut(row: TaskRow): Out<typeof productionTask> {
  return {
    id: row.id,
    status: row.status,
    position: row.position,
    startedAt: stampOrNull(row.startedAt),
    completedAt: stampOrNull(row.completedAt),
    notes: row.notes,
    stage: row.stage,
    assignee: row.assignedTo,
    order: {
      id: row.order.id,
      number: row.order.number,
      status: row.order.status,
      subject: row.order.subject,
      dueDate: dayOrNull(row.order.dueDate),
      customerName: row.order.customer.name,
    },
    updatedAt: stamp(row.updatedAt),
  }
}
