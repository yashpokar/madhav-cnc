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
