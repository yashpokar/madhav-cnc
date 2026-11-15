import { documentTotals, round2, splitGst } from '@/lib/pricing'
import type { BillData } from '@/lib/validation/purchases'

/**
 * Money and status rules for purchase bills and orders, kept free of the
 * database so they can be tested on their own.
 */

export type BillStatus = 'DRAFT' | 'POSTED' | 'CANCELLED'
export type OrderStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED'

export type BillLineInput = {
  qty: number
  rate: number
  /** A flat amount taken off this line (not a percentage). */
  discount: number
  taxRatePercent: number
}

export type BillLineTotals = {
  discount: number
  taxable: number
  taxAmount: number
  lineTotal: number
}

export type BillTotals = {
  /** Quantity times rate, before line discounts. */
  subtotal: number
  /** Sum of the line discounts. */
  discount: number
  taxableAmount: number
  cgst: number
  sgst: number
  igst: number
  taxAmount: number
  roundOff: number
  total: number
}

/**
 * Totals for a bill. Uses the same document helper as invoices (line amounts,
 * tax on each, one rounding to the whole rupee), so a bill and an invoice for
 * the same lines always agree. A line's discount is an amount, so it is
 * passed on as a net rate of 1 unit.
 */
export function billTotals(
  lines: BillLineInput[],
  isInterState: boolean,
): { lines: BillLineTotals[]; totals: BillTotals } {
  const gross = lines.map((line) => round2(line.qty * line.rate))
  const discounts = lines.map((line, index) =>
    round2(Math.min(Math.max(line.discount, 0), gross[index])),
  )
  const nets = gross.map((value, index) => round2(value - discounts[index]))

  const doc = documentTotals({
    lines: nets.map((net, index) => ({
      quantity: 1,
      rate: net,
      discountPercent: 0,
      taxRatePercent: lines[index].taxRatePercent,
    })),
    discountType: 'NONE',
    discountValue: 0,
  })

  const split = splitGst(doc.taxAmount, isInterState)

  return {
    lines: lines.map((line, index) => {
      const taxAmount = round2(nets[index] * (line.taxRatePercent / 100))

      return {
        discount: discounts[index],
        taxable: nets[index],
        taxAmount,
        lineTotal: round2(nets[index] + taxAmount),
      }
    }),
    totals: {
      subtotal: round2(gross.reduce((sum, value) => sum + value, 0)),
      discount: round2(discounts.reduce((sum, value) => sum + value, 0)),
      taxableAmount: doc.taxableAmount,
      cgst: split.cgst,
      sgst: split.sgst,
      igst: split.igst,
      taxAmount: doc.taxAmount,
      roundOff: doc.roundOff,
      total: doc.total,
    },
  }
}

/** The totals and per-line amounts to store for a validated bill. */
export function buildBill(data: BillData) {
  const { totals, lines } = billTotals(
    data.lines.map((line) => ({
      qty: line.qty,
      rate: line.rate,
      discount: line.discount,
      taxRatePercent: line.taxRatePercent,
    })),
    data.isInterState,
  )

  return {
    totals,
    lines: data.lines.map((line, index) => ({
      itemId: line.itemId,
      materialId: line.materialId,
      poLineId: line.poLineId,
      description: line.description,
      hsnCode: line.hsnCode,
      qty: line.qty,
      unit: line.unit,
      rate: line.rate,
      discount: lines[index].discount,
      taxRatePercent: line.taxRatePercent,
      taxable: lines[index].taxable,
      taxAmount: lines[index].taxAmount,
      lineTotal: lines[index].lineTotal,
    })),
  }
}

/** Order totals have no tax split of their own; same line maths as a bill. */
export function orderLineTotal(line: {
  qty: number
  rate: number
  taxRatePercent: number
}): number {
  return billTotals([{ ...line, discount: 0 }], false).lines[0].lineTotal
}

export type PaymentStatus = 'PAID' | 'PART_PAID' | 'UNPAID' | 'OVERDUE'

/**
 * Where a posted bill stands with the vendor. A bill with nothing left to pay
 * is paid; one past its due date with something still owing is overdue
 * (whether or not part of it was paid); otherwise part paid or unpaid.
 * `today` is a yyyy-mm-dd day so the result does not depend on the time zone.
 */
export function paymentStatus({
  total,
  paid,
  dueDate,
  today,
}: {
  total: number
  paid: number
  dueDate: string | null
  today: string
}): PaymentStatus {
  const balance = round2(total - paid)

  if (balance <= 0) return 'PAID'
  if (dueDate && dueDate < today) return 'OVERDUE'
  return paid > 0 ? 'PART_PAID' : 'UNPAID'
}

export function balanceDue(total: number, paid: number): number {
  return round2(total - paid)
}

const BILL_TRANSITIONS: Record<BillStatus, BillStatus[]> = {
  DRAFT: ['POSTED', 'CANCELLED'],
  POSTED: ['DRAFT', 'CANCELLED'],
  CANCELLED: [],
}

export type Transition = { ok: true } | { ok: false; reason: string }

export function canMoveBill(
  from: BillStatus,
  to: BillStatus,
  allocationCount: number,
): Transition {
  if (from === to) return { ok: false, reason: `Already ${to.toLowerCase()}` }

  if (!BILL_TRANSITIONS[from].includes(to)) {
    return {
      ok: false,
      reason: `A ${from.toLowerCase()} bill cannot be marked ${to.toLowerCase()}`,
    }
  }

  if (from === 'POSTED' && allocationCount > 0) {
    return {
      ok: false,
      reason:
        to === 'DRAFT'
          ? 'Payments are applied to this bill, so it cannot go back to draft'
          : 'Remove the payments applied to this bill before cancelling it',
    }
  }

  return { ok: true }
}

/** Posted bills are locked; only drafts can be edited. */
export const canEditBill = (status: BillStatus) => status === 'DRAFT'

/**
 * By hand an order goes draft -> sent -> cancelled. PARTIAL and RECEIVED are
 * set by goods receipts later, so they are never chosen manually, but a
 * partly or fully received order can no longer be cancelled by hand.
 */
const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['DRAFT', 'CANCELLED'],
  PARTIAL: [],
  RECEIVED: [],
  CANCELLED: [],
}

export function canMoveOrder(from: OrderStatus, to: OrderStatus): Transition {
  if (from === to) return { ok: false, reason: `Already ${to.toLowerCase()}` }

  if (!ORDER_TRANSITIONS[from].includes(to)) {
    return {
      ok: false,
      reason:
        from === 'PARTIAL' || from === 'RECEIVED'
          ? 'Goods have been received against this order, so its status can no longer be changed by hand'
          : `A ${from.toLowerCase()} order cannot be marked ${to.toLowerCase()}`,
    }
  }

  return { ok: true }
}

export const canEditOrder = (status: OrderStatus) =>
  status === 'DRAFT' || status === 'SENT'

export const DEFAULT_PAYMENT_DAYS = 30

/**
 * Due date for a bill: the bill date plus the payment terms in days (30 when
 * the vendor or company has none). Both are yyyy-mm-dd.
 */
export function defaultDueDate(
  billDate: string,
  termsDays: number | null | undefined,
): string {
  const days =
    termsDays !== null && termsDays !== undefined && termsDays >= 0
      ? Math.round(termsDays)
      : DEFAULT_PAYMENT_DAYS
  const start = new Date(`${billDate}T00:00:00Z`)

  if (Number.isNaN(start.getTime())) return billDate

  return new Date(start.getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

/** The state is the first two digits of a GSTIN. */
export function gstinState(gstin: string | null | undefined): string | null {
  const code = (gstin ?? '').trim().slice(0, 2)

  return /^\d{2}$/.test(code) ? code : null
}

/**
 * Whether buying from this vendor is an inter-state supply (IGST). Unknown
 * when either GSTIN is missing, in which case it stays intra-state.
 */
export function suggestInterState(
  companyGstin: string | null | undefined,
  vendorGstin: string | null | undefined,
): boolean {
  const ours = gstinState(companyGstin)
  const theirs = gstinState(vendorGstin)

  return ours !== null && theirs !== null && ours !== theirs
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * A plain-text summary of a purchase order for sharing in a chat message. No
 * link is included; the message carries everything the vendor needs.
 */
export function orderMessage({
  company,
  vendor,
  number,
  orderDate,
  expectedDate,
  lines,
  total,
  notes,
}: {
  company: string
  vendor: string
  number: string
  orderDate: string
  expectedDate: string | null
  lines: { description: string; qty: number; unit: string; rate: number }[]
  total: number
  notes: string | null
}): string {
  const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
  const rows = lines.map(
    (line, index) =>
      `${index + 1}. ${line.description} - ${line.qty} ${line.unit} @ Rs ${inr.format(line.rate)}`,
  )

  return [
    `Hello ${vendor},`,
    `Purchase order ${number} from ${company}`,
    `Date: ${orderDate}${expectedDate ? ` | Needed by: ${expectedDate}` : ''}`,
    '',
    ...rows,
    '',
    `Total (incl. GST): Rs ${inr.format(total)}`,
    ...(notes ? ['', notes] : []),
    '',
    'Please confirm receipt of this order.',
  ].join('\n')
}
