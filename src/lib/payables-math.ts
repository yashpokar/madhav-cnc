// Pure, DB-free money rules for what the business owes its vendors. This is
// the single definition of "what is owed"; it mirrors receivables-math so both
// sides of the books behave the same way.

import {
  AGING_BUCKETS,
  autoApplyAmount,
  bucketFor,
  daysOverdue,
  openingRemaining,
  planAutoApply,
  round2,
  type AgingKey,
} from '@/lib/receivables-math'
import { paymentStatus, type PaymentStatus } from '@/lib/purchase-rules'

export { AGING_BUCKETS, bucketFor, daysOverdue, round2 }
export type { AgingKey, PaymentStatus }

/** Payable status of a posted bill (paid / part paid / unpaid / overdue). */
export const payableStatus = paymentStatus

/** What is still owed on a bill: its total less every payment applied to it. */
export function billDue(total: number, allocated: number): number {
  return round2(total - allocated)
}

/** What is left of the payable carried from before the system. Never negative. */
export function openingPayableRemaining(openingPayable: number, applied: number): number {
  return openingRemaining(openingPayable, applied)
}

/**
 * A payment is valid when its opening portion is not negative, fits what is
 * left of the opening payable and, together with the bill allocations, does
 * not exceed the payment: sum(bill allocations) + openingApplied <= amount.
 */
export function validateVendorPaymentSplit(input: {
  payment: number
  billAllocated: number
  openingApplied: number
  openingLeft: number
}): { ok: true } | { ok: false; error: string } {
  if (input.billAllocated < 0 || input.openingApplied < 0) {
    return { ok: false, error: 'An applied amount cannot be negative' }
  }

  if (input.openingApplied > input.openingLeft + 0.005) {
    return {
      ok: false,
      error: `Only ₹${input.openingLeft} of the opening payable is outstanding`,
    }
  }

  const total = round2(input.billAllocated + input.openingApplied)

  if (total > input.payment + 0.005) {
    return {
      ok: false,
      error: `You have applied ₹${total} of a ₹${input.payment} payment`,
    }
  }

  return { ok: true }
}

/**
 * Auto-apply for a payment where the user chose nothing. Only when there is
 * exactly one thing it could belong to: a single open bill (and no opening
 * payable), or an opening payable (and no open bill). Anything else needs a
 * choice and the money stays as an advance to the vendor. The same rules as a
 * customer receipt.
 */
export function planVendorAutoApply(input: {
  payment: number
  explicitBillTotal: number
  explicitOpening: number
  openBillDues: number[]
  openingLeft: number
}): { billIndex: number | null; billAmount: number; openingAmount: number } {
  const plan = planAutoApply({
    receipt: input.payment,
    explicitInvoiceTotal: input.explicitBillTotal,
    explicitOpening: input.explicitOpening,
    openInvoiceDues: input.openBillDues,
    openingLeft: input.openingLeft,
  })

  return {
    billIndex: plan.invoiceIndex,
    billAmount: plan.invoiceAmount,
    openingAmount: plan.openingAmount,
  }
}

/** The part of a payment that is not applied to anything: an advance to the vendor. */
export function advanceAmount(payment: number, billAllocated: number, openingApplied: number): number {
  return round2(Math.max(0, payment - billAllocated - openingApplied))
}

/** Splits an amount over bills in the order given (oldest first). Returns one amount per bill. */
export function allocateOldestFirst(amount: number, dues: number[]): number[] {
  let left = round2(Math.max(0, amount))

  return dues.map((due) => {
    const take = autoApplyAmount(left, due)

    left = round2(left - take)

    return take
  })
}

export type AgingBucket = { key: AgingKey; label: string; amount: number; count: number }

/**
 * Buckets open amounts by how late they are. `dueOn` is the date the money was
 * due (a bill without a due date is due on its bill date).
 */
export function agePayables(
  rows: { due: number; dueOn: Date }[],
  today: Date,
): AgingBucket[] {
  const buckets: AgingBucket[] = AGING_BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    amount: 0,
    count: 0,
  }))

  for (const row of rows) {
    if (row.due <= 0) continue

    const key = bucketFor(daysOverdue(row.dueOn, today))
    const bucket = buckets.find((candidate) => candidate.key === key)!

    bucket.amount = round2(bucket.amount + row.due)
    bucket.count += 1
  }

  return buckets
}

/** Amount past its due date (anything bucketed beyond "not due"). */
export function overdueAmount(rows: { due: number; dueOn: Date }[], today: Date): number {
  return round2(
    rows.reduce(
      (sum, row) => (row.due > 0 && daysOverdue(row.dueOn, today) > 0 ? sum + row.due : sum),
      0,
    ),
  )
}

export type StatementEntry = {
  kind: 'opening' | 'bill' | 'payment'
  date: Date
  /** Sort tiebreaker: creation order within a day. */
  order: number
  /** Increases what is owed to the vendor. */
  debit: number
  /** Reduces what is owed to the vendor. */
  credit: number
}

/**
 * Running balance for a vendor statement. Positive means the business owes the
 * vendor; negative means the vendor holds an advance. The opening payable
 * comes first, then bills and payments by date.
 */
export function withRunningBalance<T extends StatementEntry>(
  entries: T[],
): (T & { balance: number })[] {
  const rank = { opening: 0, bill: 1, payment: 2 } as const
  const sorted = [...entries].sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      rank[a.kind] - rank[b.kind] ||
      a.order - b.order,
  )
  let balance = 0

  return sorted.map((entry) => {
    balance = round2(balance + entry.debit - entry.credit)

    return { ...entry, balance }
  })
}
