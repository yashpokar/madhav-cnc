/**
 * The rules behind stock and goods receiving, kept free of the database so
 * they can be tested on their own.
 *
 * Stock is an append-only ledger of signed movements. Nothing here edits a
 * movement: a correction is a new movement that offsets the old one.
 */

export type MovementType =
  | 'OPENING'
  | 'PURCHASE'
  | 'PURCHASE_RETURN'
  | 'ADJUSTMENT'
  | 'ISSUE'

export type MovementLike = {
  type: MovementType
  qty: number
  unitCost: number
}

export type PoStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED'

/** Quantities have three decimals, money four (unit costs). */
export const round3 = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000
export const round4 = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000
export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** What is on hand: the sum of every signed movement. */
export function onHand(movements: { qty: number }[]): number {
  return round3(movements.reduce((sum, movement) => sum + movement.qty, 0))
}

/** Movement types that carry a cost and so feed the average. */
const COSTED: ReadonlySet<MovementType> = new Set(['OPENING', 'PURCHASE', 'PURCHASE_RETURN'])

/**
 * Weighted-average cost, worked out when it is asked for: total cost of what
 * came in divided by the quantity that came in. A purchase return carries the
 * cost of the receipt it undoes, so it comes off both sides and a cancelled
 * receipt leaves the average where it was. Adjustments and issues carry no
 * cost and are left out. With nothing costed there is no average, so 0.
 */
export function averageCost(movements: MovementLike[]): number {
  let qty = 0
  let cost = 0

  for (const movement of movements) {
    if (!COSTED.has(movement.type)) continue

    qty += movement.qty
    cost += movement.qty * movement.unitCost
  }

  return qty > 0 ? round4(cost / qty) : 0
}

/** Value of what is on hand at the average cost (never below zero). */
export function stockValue(onHandQty: number, avgCost: number): number {
  return onHandQty > 0 ? round2(onHandQty * avgCost) : 0
}

export type StockState = 'negative' | 'out' | 'low' | 'ok'

/** Where a stocked thing stands against zero and its reorder level. */
export function stockState(onHandQty: number, reorderLevel: number | null): StockState {
  if (onHandQty < 0) return 'negative'
  if (onHandQty === 0) return 'out'
  if (reorderLevel !== null && reorderLevel > 0 && onHandQty <= reorderLevel) return 'low'

  return 'ok'
}

export type StockFilter = 'all' | 'low' | 'out' | 'negative'

/** "Low" includes what is out, since out of stock is the lowest it gets. */
export function matchesStockFilter(state: StockState, filter: StockFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'low':
      return state === 'low' || state === 'out'
    case 'out':
      return state === 'out'
    case 'negative':
      return state === 'negative'
  }
}

/** The key one stocked thing goes by, whether an item or a material. */
export const stockKey = (target: { itemId: string | null; materialId: string | null }) =>
  target.itemId ? `item:${target.itemId}` : `material:${target.materialId}`

/**
 * Who would go below zero if these quantities were taken out. `current` is
 * what is on hand now and `taking` what each would lose (positive numbers).
 */
export function negativeStockGuard(
  current: Map<string, number>,
  taking: Map<string, number>,
): { key: string; onHand: number; after: number }[] {
  const breaches: { key: string; onHand: number; after: number }[] = []

  for (const [key, qty] of taking) {
    const have = current.get(key) ?? 0
    const after = round3(have - qty)

    if (qty > 0 && after < 0) breaches.push({ key, onHand: have, after })
  }

  return breaches
}

/**
 * How much of a line can still be received. Never below zero, so a line that
 * was over-received (a correction after the fact) simply shows nothing left.
 * When the line is also capped by another document (a bill line that points at
 * an order line), pass that cap too and the smaller room wins.
 */
export function remainingToReceive(
  ordered: number,
  alreadyReceived: number,
  otherRemaining?: number,
): number {
  const own = Math.max(0, round3(ordered - alreadyReceived))

  return otherRemaining === undefined ? own : Math.min(own, Math.max(0, round3(otherRemaining)))
}

/**
 * The status an order should have given what has been received. Drafts and
 * cancelled orders keep theirs: receiving never moves them. Only lines that
 * can be received count, so a service line never holds an order open.
 */
export function derivePoStatus(
  current: PoStatus,
  lines: { qty: number; receivedQty: number }[],
): PoStatus {
  if (current === 'DRAFT' || current === 'CANCELLED') return current
  if (lines.length === 0) return current

  const received = lines.filter((line) => line.receivedQty > 0)

  if (received.length === 0) return 'SENT'

  return lines.every((line) => line.receivedQty >= line.qty) ? 'RECEIVED' : 'PARTIAL'
}

export type ReceiptMovement = {
  itemId: string | null
  materialId: string | null
  qty: number
  unitCost: number
}

/**
 * The movements that undo a receipt: the same things at the same cost, with
 * the sign flipped, as purchase returns.
 */
export function reversalMovements(movements: ReceiptMovement[]) {
  return movements.map((movement) => ({
    itemId: movement.itemId,
    materialId: movement.materialId,
    type: 'PURCHASE_RETURN' as const,
    qty: round3(-movement.qty),
    unitCost: movement.unitCost,
  }))
}

/** Sums quantities by stocked thing. */
export function totalsByKey(
  movements: { itemId: string | null; materialId: string | null; qty: number }[],
): Map<string, number> {
  const totals = new Map<string, number>()

  for (const movement of movements) {
    const key = stockKey(movement)

    totals.set(key, round3((totals.get(key) ?? 0) + movement.qty))
  }

  return totals
}

/** Each movement with the balance after it, in the order given (oldest first). */
export function runningBalance<T extends { qty: number }>(
  movements: T[],
): (T & { balance: number })[] {
  let balance = 0

  return movements.map((movement) => {
    balance = round3(balance + movement.qty)

    return { ...movement, balance }
  })
}

/** The cost of one unit from a bill line: what was paid for it, before GST. */
export function unitCostFromTaxable(taxable: number, qty: number): number {
  return qty > 0 ? round4(taxable / qty) : 0
}
