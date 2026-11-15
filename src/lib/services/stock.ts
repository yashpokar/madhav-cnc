import { prisma } from '@/lib/prisma'
import { negativeStockGuard, round3, round4, stockKey } from '@/lib/stock-rules'
import { onHandFor } from '@/lib/services/goods-receipts'
import type { Failure } from '@/lib/services/goods-receipts'

/**
 * Hand-made stock changes: setting the opening stock and adjusting after a
 * count. Plain functions taking the acting user's id, like the receiving ones.
 */

export type StockKind = 'item' | 'material'

export type StockTarget = { kind: StockKind; id: string }

export type StockResult = { ok: true; onHand: number } | Failure

const targetKeys = (target: StockTarget) =>
  target.kind === 'item'
    ? { itemId: target.id, materialId: null }
    : { itemId: null, materialId: target.id }

async function loadTarget(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], target: StockTarget) {
  const row =
    target.kind === 'item'
      ? await tx.item.findUnique({ where: { id: target.id }, select: { name: true, stockTracked: true } })
      : await tx.material.findUnique({ where: { id: target.id }, select: { name: true, stockTracked: true } })

  return row
}

/** Parses a yyyy-mm-dd day into a date, or null. */
function parseDay(day: string | undefined): Date | null {
  if (!day) return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)

  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(new Date(`${day}T00:00:00Z`).getTime())
    ? new Date(`${day}T00:00:00Z`)
    : null
}

/**
 * Sets the opening stock: one OPENING movement with a quantity and a cost.
 * Only once per thing; after that, adjust instead.
 */
export function setOpeningStock(
  userId: string | null,
  input: { target: StockTarget; qty: number; unitCost: number; date?: string; note?: string },
): Promise<StockResult> {
  return prisma.$transaction(async (tx): Promise<StockResult> => {
    const row = await loadTarget(tx, input.target)

    if (!row) return { ok: false, error: 'Not found' }
    if (!row.stockTracked) return { ok: false, error: `Turn on Track stock for ${row.name} first` }

    if (!Number.isFinite(input.qty) || input.qty <= 0) {
      return { ok: false, error: 'Opening quantity must be more than zero' }
    }

    if (round3(input.qty) !== input.qty) return { ok: false, error: 'Quantity can have at most 3 decimals' }

    if (!Number.isFinite(input.unitCost) || input.unitCost < 0) {
      return { ok: false, error: 'Cost cannot be negative' }
    }

    const date = parseDay(input.date)

    if (!date) return { ok: false, error: 'Enter a valid date' }

    const keys = targetKeys(input.target)
    const existing = await tx.stockMovement.count({ where: { ...keys, type: 'OPENING' } })

    if (existing > 0) {
      return { ok: false, error: 'Opening stock is already set. Use Adjust stock to correct it.' }
    }

    await tx.stockMovement.create({
      data: {
        ...keys,
        type: 'OPENING',
        qty: input.qty,
        unitCost: round4(input.unitCost),
        date,
        reference: 'Opening stock',
        note: input.note?.trim() || null,
        createdById: userId,
      },
    })

    const have = await onHandFor(tx, [keys])

    return { ok: true, onHand: have.get(stockKey(keys)) ?? 0 }
  })
}

/**
 * Adds or removes stock by hand (a count, damage, a find). `qty` is signed and
 * a reason is required. Taking stock below zero is refused unless
 * `allowNegative` (the caller decides who may say so).
 */
export function adjustStock(
  userId: string | null,
  input: {
    target: StockTarget
    qty: number
    reason: string
    date?: string
    allowNegative?: boolean
  },
): Promise<StockResult> {
  return prisma.$transaction(async (tx): Promise<StockResult> => {
    const row = await loadTarget(tx, input.target)

    if (!row) return { ok: false, error: 'Not found' }
    if (!row.stockTracked) return { ok: false, error: `Turn on Track stock for ${row.name} first` }

    const reason = input.reason.trim()

    if (!reason) return { ok: false, error: 'A reason is required' }
    if (reason.length > 300) return { ok: false, error: 'Keep the reason under 300 characters' }

    if (!Number.isFinite(input.qty) || input.qty === 0) {
      return { ok: false, error: 'Enter a quantity to add (+) or remove (-)' }
    }

    if (round3(input.qty) !== input.qty) return { ok: false, error: 'Quantity can have at most 3 decimals' }

    const date = parseDay(input.date)

    if (!date) return { ok: false, error: 'Enter a valid date' }

    const keys = targetKeys(input.target)
    const key = stockKey(keys)
    const current = await onHandFor(tx, [keys])

    if (input.qty < 0 && !input.allowNegative) {
      const breaches = negativeStockGuard(current, new Map([[key, -input.qty]]))

      if (breaches.length > 0) {
        return {
          ok: false,
          code: 'NEGATIVE_STOCK',
          error: `Only ${breaches[0].onHand} of ${row.name} is on hand, so ${-input.qty} cannot be removed.`,
        }
      }
    }

    await tx.stockMovement.create({
      data: {
        ...keys,
        type: 'ADJUSTMENT',
        qty: input.qty,
        unitCost: 0,
        date,
        reference: 'Adjustment',
        note: reason,
        createdById: userId,
      },
    })

    return { ok: true, onHand: round3((current.get(key) ?? 0) + input.qty) }
  })
}
