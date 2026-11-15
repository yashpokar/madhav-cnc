// Pure, DB-free rules for balance adjustments: auditable corrections to a
// payment mode's cash/bank balance or to what a customer owes.
//
// Sign conventions (the amount is always stored signed):
//  - CHANNEL:  amount > 0 adds money to the payment mode ("cash in hand was
//              more than the books said"); amount < 0 removes money.
//  - CUSTOMER: amount > 0 means the customer owes MORE (a debit, like an extra
//              bill); amount < 0 means the customer owes LESS (a credit).
//
// People enter a positive amount and pick a direction; the sign is derived
// here, never typed.

import { round2 } from '@/lib/receivables-math'

export const MAX_ADJUSTMENT = 99_999_999

/** Entry direction: money added / customer owes more, or the opposite. */
export type Direction = 'up' | 'down'

export type DatedAmount = { amount: number; adjustedOn: Date }

/** The signed amount for a positive entered amount and a direction. */
export function signedAmount(direction: Direction, entered: number): number {
  const magnitude = round2(Math.abs(entered))

  return direction === 'up' ? magnitude : round2(-magnitude)
}

/** The direction a stored signed amount was entered in. */
export function directionOf(amount: number): Direction {
  return amount < 0 ? 'down' : 'up'
}

export function validateAdjustmentAmount(
  entered: number,
): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(entered) || round2(entered) === 0) {
    return { ok: false, error: 'Enter an amount greater than zero' }
  }

  if (Math.abs(entered) > MAX_ADJUSTMENT) {
    return { ok: false, error: 'That amount is too large' }
  }

  return { ok: true }
}

/** An adjustment can be back-dated freely but not set far into the future. */
export function isFarFuture(date: Date, today: Date, graceDays = 31): boolean {
  const limit = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() + graceDays,
  )

  return date.getTime() > limit
}

/**
 * The adjustments that count towards a payment mode's balance: those dated on
 * or after its opening "as of" date (everything when there is no opening
 * date), so a correction to pre-system history is never added twice.
 */
export function channelAdjustmentTotal(
  rows: DatedAmount[],
  asOf: Date | null,
): number {
  return round2(
    rows
      .filter((row) => !asOf || row.adjustedOn.getTime() >= asOf.getTime())
      .reduce((sum, row) => sum + row.amount, 0),
  )
}

/** Closing balance of a mode: opening + in - out + adjustments (all signed). */
export function channelClosingWithAdjustments(input: {
  opening: number
  inflow: number
  outflow: number
  adjustments: number
}): number {
  return round2(input.opening + input.inflow - input.outflow + input.adjustments)
}

/**
 * A customer's adjustments split onto the two sides the account already has:
 *  - a net increase is an extra DEBIT, folded into "due" (aged from the oldest
 *    increase, like the opening balance is aged from its date);
 *  - a net decrease is an extra CREDIT, shown beside credit notes, so "due"
 *    itself never goes negative and "net" can (a credit balance).
 * The sum is netted first, so +500 then -200 is a 300 debit, not 500 and 200.
 */
export function customerAdjustmentSplit(rows: DatedAmount[]): {
  net: number
  debit: number
  credit: number
  agingFrom: Date | null
} {
  const net = round2(rows.reduce((sum, row) => sum + row.amount, 0))
  const debit = net > 0 ? net : 0
  const credit = net < 0 ? round2(-net) : 0
  const increases = rows.filter((row) => row.amount > 0)
  const agingFrom =
    debit > 0 && increases.length > 0
      ? new Date(Math.min(...increases.map((row) => row.adjustedOn.getTime())))
      : null

  return { net, debit, credit, agingFrom }
}

/**
 * The one definition of a customer's account including adjustments. Each
 * adjustment lands in exactly one place: an increase in `due`, a decrease in
 * `credit`. Receipts are still applied to invoices and the opening balance
 * only; a positive adjustment is settled by receipts left on account, which
 * the net formula already nets off.
 */
export function customerBalance(input: {
  invoiceDue: number
  openingRemaining: number
  onAccount: number
  creditNotes: number
  adjustments: DatedAmount[]
}): {
  due: number
  credit: number
  onAccount: number
  net: number
  adjustmentNet: number
  adjustmentDebit: number
  adjustmentCredit: number
} {
  const split = customerAdjustmentSplit(input.adjustments)
  const due = round2(input.invoiceDue + input.openingRemaining + split.debit)
  const credit = round2(input.creditNotes + split.credit)

  return {
    due,
    credit,
    onAccount: input.onAccount,
    net: round2(due - input.onAccount - credit),
    adjustmentNet: split.net,
    adjustmentDebit: split.debit,
    adjustmentCredit: split.credit,
  }
}

/** The balance after applying a signed change, for the live preview. */
export function previewBalance(current: number, change: number): number {
  return round2(current + change)
}
