// Pure, DB-free money helpers. This is the single definition of "what is owed".

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export const AGING_BUCKETS = [
  { key: 'notDue', label: 'Not due', from: -Infinity, to: 0 },
  { key: 'b30', label: '1 – 30 days', from: 1, to: 30 },
  { key: 'b60', label: '31 – 60 days', from: 31, to: 60 },
  { key: 'b90', label: '61 – 90 days', from: 61, to: 90 },
  { key: 'b90plus', label: 'Over 90 days', from: 91, to: Infinity },
] as const

export type AgingKey = (typeof AGING_BUCKETS)[number]['key']

export function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

export function daysOverdue(reference: Date, today: Date): number {
  const ms = startOfDay(today).getTime() - startOfDay(reference).getTime()

  return Math.floor(ms / 86_400_000)
}

export function bucketFor(days: number): AgingKey {
  const match = AGING_BUCKETS.find(
    (bucket) => days >= bucket.from && days <= bucket.to,
  )

  return (match ?? AGING_BUCKETS[0]).key
}

/** Invoice balance: total less advance adjusted, allocations and write-offs. */
export function invoiceDue(input: {
  total: number
  advanceAdjusted: number
  allocated: number
  writtenOff: number
}): number {
  return round2(
    input.total - input.advanceAdjusted - input.allocated - input.writtenOff,
  )
}

/** Amount of a receipt to auto-apply to the single open invoice. */
export function autoApplyAmount(receipt: number, due: number): number {
  return round2(Math.max(0, Math.min(receipt, due)))
}

/** Delivered-but-uninvoiced order: total minus advances paid, never negative. */
export function uninvoicedDue(orderTotal: number, advancePaid: number): number {
  return Math.max(0, orderTotal - advancePaid)
}

/**
 * What is still owed from before the system: the opening due less whatever
 * receipts have been applied to it. Never negative.
 */
export function openingRemaining(openingDue: number, applied: number): number {
  return round2(Math.max(0, openingDue - applied))
}

/**
 * A receipt's opening portion is valid when it is not negative, does not exceed
 * what is left of the opening balance and, together with the invoice
 * allocations, does not exceed the receipt.
 */
export function validateOpeningApplied(input: {
  receipt: number
  invoiceAllocated: number
  openingApplied: number
  openingLeft: number
}): { ok: true } | { ok: false; error: string } {
  if (input.openingApplied < 0) {
    return { ok: false, error: 'The opening balance amount cannot be negative' }
  }

  if (input.openingApplied > input.openingLeft + 0.005) {
    return {
      ok: false,
      error: `Only ₹${input.openingLeft} of the opening balance is outstanding`,
    }
  }

  const total = round2(input.invoiceAllocated + input.openingApplied)

  if (total > input.receipt + 0.005) {
    return {
      ok: false,
      error: `You have applied ₹${total} of a ₹${input.receipt} receipt`,
    }
  }

  return { ok: true }
}

/**
 * Auto-apply for a receipt where the user chose nothing. Only when there is
 * exactly one thing it could belong to: a single open invoice (and no opening
 * balance), or an opening balance (and no open invoice). Anything else needs a
 * choice and the money stays on account.
 */
export function planAutoApply(input: {
  receipt: number
  explicitInvoiceTotal: number
  explicitOpening: number
  openInvoiceDues: number[]
  openingLeft: number
}): { invoiceIndex: number | null; invoiceAmount: number; openingAmount: number } {
  const none = { invoiceIndex: null, invoiceAmount: 0, openingAmount: 0 }

  if (input.explicitInvoiceTotal > 0 || input.explicitOpening > 0) return none

  const dues = input.openInvoiceDues.filter((due) => due > 0)

  if (dues.length === 1 && input.openingLeft <= 0) {
    return {
      invoiceIndex: input.openInvoiceDues.findIndex((due) => due > 0),
      invoiceAmount: autoApplyAmount(input.receipt, dues[0]),
      openingAmount: 0,
    }
  }

  if (dues.length === 0 && input.openingLeft > 0) {
    return {
      invoiceIndex: null,
      invoiceAmount: 0,
      openingAmount: autoApplyAmount(input.receipt, input.openingLeft),
    }
  }

  return none
}

/**
 * Closing balance of a payment mode (signed): opening plus money in minus
 * money out since the opening date. A negative opening is an overdraft.
 */
export function channelClosing(opening: number, inflow: number, outflow: number): number {
  return round2(opening + inflow - outflow)
}
