import { prisma } from '@/lib/prisma'
import { requireCompanyId } from '@/lib/active-company'
import { logActivity } from '@/lib/activity'
import { nextReceiptNumber } from '@/lib/codes'
import {
  derivePoStatus,
  negativeStockGuard,
  remainingToReceive,
  reversalMovements,
  round2,
  round3,
  round4,
  stockKey,
  totalsByKey,
  unitCostFromTaxable,
  type PoStatus,
} from '@/lib/stock-rules'
import type { PurchaseTx } from '@/lib/purchase-hooks'

/**
 * Receiving goods and undoing a receipt. Plain functions that take the acting
 * user's id (no session), so the server actions, the bill-posting hook and
 * scripts all run the very same code. The *InTx functions run inside a
 * transaction the caller owns; the wrappers below them open their own.
 */

export type ReceiveSource = { kind: 'bill'; billId: string } | { kind: 'order'; poId: string }

export type ReceiveInput = {
  source: ReceiveSource
  /** yyyy-mm-dd or a Date; the day the goods arrived. */
  receivedOn: Date
  notes?: string | null
  /** Quantities per bill line / order line, or every line's remaining quantity. */
  lines: { lineId: string; qty: number }[] | 'all'
}

export type Failure = { ok: false; error: string; code?: 'NEGATIVE_STOCK' }

export type ReceiveResult =
  | { ok: true; receipt: { id: string; number: string; lineCount: number } | null }
  | Failure

export type CancelResult =
  | { ok: true; number: string; alreadyCancelled: boolean }
  | Failure

/** One line that could be received, with how much room is left. */
export type ReceivableLine = {
  lineId: string
  itemId: string | null
  materialId: string | null
  description: string
  unit: string
  ordered: number
  received: number
  remaining: number
  unitCost: number
  /** Whether receiving it adds to stock. */
  tracked: boolean
}

export type Receivable = {
  source: ReceiveSource
  number: string
  vendorId: string
  vendorName: string
  poId: string | null
  billId: string | null
  lines: ReceivableLine[]
}

const dayOf = (date: Date) => date.toISOString().slice(0, 10)
const today = () => new Date(`${dayOf(new Date())}T00:00:00Z`)

/** Holds the source document's row until the transaction ends, so two receipts
 * against it queue up instead of both passing the "enough left" check. */
async function lockSource(tx: PurchaseTx, source: ReceiveSource) {
  if (source.kind === 'bill') {
    await tx.$queryRaw`SELECT id FROM purchase_bills WHERE id = ${source.billId} FOR UPDATE`
  } else {
    await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${source.poId} FOR UPDATE`
  }
}

const lineKind = {
  item: { select: { supplyType: true, stockTracked: true } },
  material: { select: { stockTracked: true } },
} as const

/**
 * What can still be received against a posted bill or a sent order. Lines
 * without an item or material (free text), and services, cannot be received.
 */
export async function loadReceivable(
  tx: PurchaseTx,
  source: ReceiveSource,
): Promise<Receivable | { error: string }> {
  if (source.kind === 'bill') {
    const bill = await tx.purchaseBill.findUnique({
      where: { id: source.billId },
      include: {
        vendor: { select: { name: true } },
        lines: {
          orderBy: { id: 'asc' },
          include: { ...lineKind, poLine: { select: { qty: true, receivedQty: true } } },
        },
      },
    })

    if (!bill) return { error: 'Bill not found' }
    if (bill.status !== 'POSTED') return { error: 'Post the bill before receiving goods against it' }

    const lineIds = bill.lines.map((line) => line.id)
    const done = await tx.goodsReceiptLine.findMany({
      where: { billLineId: { in: lineIds }, receipt: { status: 'POSTED' } },
      select: { billLineId: true, qty: true },
    })
    const receivedBy = new Map<string, number>()

    for (const row of done) {
      receivedBy.set(row.billLineId!, round3((receivedBy.get(row.billLineId!) ?? 0) + row.qty.toNumber()))
    }

    const lines: ReceivableLine[] = bill.lines
      .filter((line) => (line.itemId || line.materialId) && line.item?.supplyType !== 'SERVICE')
      .map((line) => {
        const qty = line.qty.toNumber()
        const received = receivedBy.get(line.id) ?? 0
        const poRoom = line.poLine
          ? line.poLine.qty.toNumber() - line.poLine.receivedQty.toNumber()
          : undefined

        return {
          lineId: line.id,
          itemId: line.itemId,
          materialId: line.materialId,
          description: line.description,
          unit: line.unit,
          ordered: qty,
          received,
          remaining: remainingToReceive(qty, received, poRoom),
          unitCost: unitCostFromTaxable(line.taxable.toNumber(), qty),
          tracked: Boolean(line.item?.stockTracked || line.material?.stockTracked),
        }
      })

    return {
      source,
      number: bill.number,
      vendorId: bill.vendorId,
      vendorName: bill.vendor.name,
      poId: bill.poId,
      billId: bill.id,
      lines,
    }
  }

  const order = await tx.purchaseOrder.findUnique({
    where: { id: source.poId },
    include: {
      vendor: { select: { name: true } },
      lines: { orderBy: { sortOrder: 'asc' }, include: lineKind },
    },
  })

  if (!order) return { error: 'Purchase order not found' }

  if (order.status === 'DRAFT') return { error: 'Send the purchase order before receiving goods against it' }
  if (order.status === 'CANCELLED') return { error: 'This purchase order is cancelled' }

  const lines: ReceivableLine[] = order.lines
    .filter((line) => (line.itemId || line.materialId) && line.item?.supplyType !== 'SERVICE')
    .map((line) => {
      const qty = line.qty.toNumber()
      const received = line.receivedQty.toNumber()

      return {
        lineId: line.id,
        itemId: line.itemId,
        materialId: line.materialId,
        description: line.description,
        unit: line.unit,
        ordered: qty,
        received,
        remaining: remainingToReceive(qty, received),
        unitCost: round4(line.rate.toNumber()),
        tracked: Boolean(line.item?.stockTracked || line.material?.stockTracked),
      }
    })

  return {
    source,
    number: order.number,
    vendorId: order.vendorId,
    vendorName: order.vendor.name,
    poId: order.id,
    billId: null,
    lines,
  }
}

/** The order's status, re-derived from what has been received on its lines. */
async function refreshOrderStatus(tx: PurchaseTx, poId: string) {
  const order = await tx.purchaseOrder.findUnique({
    where: { id: poId },
    select: {
      status: true,
      lines: {
        select: {
          qty: true,
          receivedQty: true,
          itemId: true,
          materialId: true,
          item: { select: { supplyType: true } },
        },
      },
    },
  })

  if (!order) return

  const receivable = order.lines
    .filter((line) => (line.itemId || line.materialId) && line.item?.supplyType !== 'SERVICE')
    .map((line) => ({ qty: line.qty.toNumber(), receivedQty: line.receivedQty.toNumber() }))
  const next = derivePoStatus(order.status as PoStatus, receivable)

  if (next !== order.status) {
    await tx.purchaseOrder.update({ where: { id: poId }, data: { status: next } })
  }
}

/**
 * Repair helper: makes sure every stock-tracked receipt line has its purchase
 * movement, and only one. Posting already creates them with the receipt, so
 * on a healthy receipt this adds nothing. Safe to run again: a line that already has a movement is left
 * alone (and receiptLineId is unique in the database, as a last guard).
 */
export async function ensureReceiptMovements(tx: PurchaseTx, receiptId: string, userId: string | null) {
  const receipt = await tx.goodsReceipt.findUnique({
    where: { id: receiptId },
    include: {
      lines: {
        include: {
          item: { select: { stockTracked: true } },
          material: { select: { stockTracked: true } },
          movement: { select: { id: true } },
        },
      },
    },
  })

  if (!receipt) return 0

  let created = 0

  for (const line of receipt.lines) {
    const tracked = Boolean(line.item?.stockTracked || line.material?.stockTracked)

    if (!tracked || line.movement) continue

    await tx.stockMovement.create({
      data: {
        itemId: line.itemId,
        materialId: line.materialId,
        type: 'PURCHASE',
        qty: line.qty,
        unitCost: line.unitCost,
        date: receipt.receivedOn,
        receiptLineId: line.id,
        reference: receipt.number,
        createdById: userId,
      },
    })
    created += 1
  }

  return created
}

/**
 * Posts a goods receipt: its lines, the stock movements, the order's received
 * quantities and status, and each item's last purchase rate, all inside the
 * caller's transaction (so they commit or roll back together).
 */
export async function receiveGoodsInTx(
  tx: PurchaseTx,
  userId: string | null,
  input: ReceiveInput,
): Promise<ReceiveResult> {
  await lockSource(tx, input.source)

  const receivable = await loadReceivable(tx, input.source)

  if ('error' in receivable) return { ok: false, error: receivable.error }

  const byId = new Map(receivable.lines.map((line) => [line.lineId, line]))
  let wanted: { lineId: string; qty: number }[]

  if (input.lines === 'all') {
    wanted = receivable.lines
      .filter((line) => line.remaining > 0)
      .map((line) => ({ lineId: line.lineId, qty: line.remaining }))

    if (wanted.length === 0) return { ok: true, receipt: null }
  } else {
    wanted = input.lines.filter((line) => line.qty > 0)

    if (new Set(wanted.map((line) => line.lineId)).size !== wanted.length) {
      return { ok: false, error: 'A line appears twice in this receipt' }
    }

    if (wanted.length === 0) return { ok: false, error: 'Enter a quantity for at least one line' }
  }

  for (const line of wanted) {
    const known = byId.get(line.lineId)

    if (!known) return { ok: false, error: 'A line does not belong to this document, or cannot be received' }

    if (!Number.isFinite(line.qty) || round3(line.qty) !== line.qty) {
      return { ok: false, error: `Quantity for "${known.description}" must have at most 3 decimals` }
    }

    if (line.qty > known.remaining) {
      return {
        ok: false,
        error:
          known.remaining === 0
            ? `"${known.description}" has already been fully received`
            : `Only ${known.remaining} of "${known.description}" is left to receive`,
      }
    }
  }

  const number = await nextReceiptNumber()
  const poLineOf = new Map<string, string | null>()

  if (input.source.kind === 'bill') {
    const billLines = await tx.purchaseBillLine.findMany({
      where: { id: { in: wanted.map((line) => line.lineId) } },
      select: { id: true, poLineId: true },
    })

    for (const row of billLines) poLineOf.set(row.id, row.poLineId)
  }

  const companyId = await requireCompanyId()

  // One create for the receipt, its lines and their stock movements. The scope
  // layer checks references outside this transaction, where rows written by it
  // are not visible yet, so a line (or movement) cannot be added to a receipt
  // after the fact; nesting them keeps them in a single write.
  const lineData = wanted.map((line) => {
    const known = byId.get(line.lineId)!
    const poLineId =
      input.source.kind === 'order' ? line.lineId : (poLineOf.get(line.lineId) ?? null)

    return {
      poLineId,
      known,
      qty: line.qty,
      data: {
        billLineId: input.source.kind === 'bill' ? line.lineId : null,
        poLineId,
        itemId: known.itemId,
        materialId: known.materialId,
        qty: line.qty,
        unitCost: known.unitCost,
        ...(known.tracked
          ? {
              movement: {
                create: {
                  companyId,
                  itemId: known.itemId,
                  materialId: known.materialId,
                  type: 'PURCHASE' as const,
                  qty: line.qty,
                  unitCost: known.unitCost,
                  date: input.receivedOn,
                  reference: number,
                  createdById: userId,
                },
              },
            }
          : {}),
      },
    }
  })

  const receipt = await tx.goodsReceipt.create({
    data: {
      number,
      status: 'POSTED',
      vendorId: receivable.vendorId,
      billId: receivable.billId,
      poId: receivable.poId,
      receivedOn: input.receivedOn,
      notes: input.notes?.trim() || null,
      lines: { create: lineData.map((line) => line.data) },
    },
  })

  for (const line of lineData) {
    if (line.poLineId) {
      await tx.purchaseOrderLine.update({
        where: { id: line.poLineId },
        data: { receivedQty: { increment: line.qty } },
      })
    }

    // The rate last paid, shown on the item (read-only there).
    if (line.known.itemId && line.known.unitCost > 0) {
      await tx.item.update({
        where: { id: line.known.itemId },
        data: { purchaseRate: round2(line.known.unitCost) },
      })
    }
  }

  if (receivable.poId) await refreshOrderStatus(tx, receivable.poId)

  return { ok: true, receipt: { id: receipt.id, number, lineCount: wanted.length } }
}

/** Current on-hand for each stocked thing, as the sum of its movements. */
export async function onHandFor(
  tx: PurchaseTx,
  targets: { itemId: string | null; materialId: string | null }[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()

  for (const target of targets) {
    const key = stockKey(target)

    if (result.has(key)) continue

    const sum = await tx.stockMovement.aggregate({
      where: target.itemId ? { itemId: target.itemId } : { materialId: target.materialId },
      _sum: { qty: true },
    })

    result.set(key, round3(sum._sum.qty?.toNumber() ?? 0))
  }

  return result
}

async function describeKeys(tx: PurchaseTx, keys: string[]) {
  const names = new Map<string, string>()

  for (const key of keys) {
    const [kind, id] = key.split(':')
    const row =
      kind === 'item'
        ? await tx.item.findUnique({ where: { id }, select: { name: true } })
        : await tx.material.findUnique({ where: { id }, select: { name: true } })

    names.set(key, row?.name ?? 'an item')
  }

  return names
}

/**
 * Cancels a goods receipt: appends purchase-return movements that offset the
 * ones it made, takes its quantities off the order and re-derives the order's
 * status. Refused if it would push stock below zero, unless `allowNegative`
 * (the caller decides who may say so). Cancelling twice is harmless.
 */
export async function cancelReceiptInTx(
  tx: PurchaseTx,
  userId: string | null,
  receiptId: string,
  options: { allowNegative?: boolean } = {},
): Promise<CancelResult> {
  await tx.$queryRaw`SELECT id FROM goods_receipts WHERE id = ${receiptId} FOR UPDATE`

  const receipt = await tx.goodsReceipt.findUnique({
    where: { id: receiptId },
    include: { lines: { include: { movement: true } } },
  })

  if (!receipt) return { ok: false, error: 'Goods receipt not found' }

  if (receipt.status === 'CANCELLED') {
    return { ok: true, number: receipt.number, alreadyCancelled: true }
  }

  const original = receipt.lines.flatMap((line) =>
    line.movement
      ? [
          {
            itemId: line.movement.itemId,
            materialId: line.movement.materialId,
            qty: line.movement.qty.toNumber(),
            unitCost: line.movement.unitCost.toNumber(),
          },
        ]
      : [],
  )

  if (!options.allowNegative && original.length > 0) {
    const breaches = negativeStockGuard(await onHandFor(tx, original), totalsByKey(original))

    if (breaches.length > 0) {
      const names = await describeKeys(
        tx,
        breaches.map((breach) => breach.key),
      )
      const detail = breaches
        .map((breach) => `${names.get(breach.key)} (${breach.onHand} on hand)`)
        .join(', ')

      return {
        ok: false,
        code: 'NEGATIVE_STOCK',
        error: `Cancelling ${receipt.number} would take stock below zero for ${detail}. The goods may already have been used.`,
      }
    }
  }

  const claimed = await tx.goodsReceipt.updateMany({
    where: { id: receiptId, status: 'POSTED' },
    data: { status: 'CANCELLED' },
  })

  if (claimed.count === 0) return { ok: true, number: receipt.number, alreadyCancelled: true }

  for (const movement of reversalMovements(original)) {
    await tx.stockMovement.create({
      data: {
        ...movement,
        date: today(),
        reference: receipt.number,
        note: `Reversal of ${receipt.number}`,
        createdById: userId,
      },
    })
  }

  const poIds = new Set<string>()

  for (const line of receipt.lines) {
    if (!line.poLineId) continue

    const poLine = await tx.purchaseOrderLine.findUnique({
      where: { id: line.poLineId },
      select: { receivedQty: true, poId: true },
    })

    if (!poLine) continue

    await tx.purchaseOrderLine.update({
      where: { id: line.poLineId },
      data: { receivedQty: Math.max(0, round3(poLine.receivedQty.toNumber() - line.qty.toNumber())) },
    })
    poIds.add(poLine.poId)
  }

  for (const poId of poIds) await refreshOrderStatus(tx, poId)

  return { ok: true, number: receipt.number, alreadyCancelled: false }
}

/** Receives goods in a transaction of its own. */
export function receiveGoods(userId: string | null, input: ReceiveInput): Promise<ReceiveResult> {
  return prisma.$transaction((tx) => receiveGoodsInTx(tx, userId, input))
}

/** Cancels a receipt in a transaction of its own. */
export function cancelReceipt(
  userId: string | null,
  receiptId: string,
  options: { allowNegative?: boolean } = {},
): Promise<CancelResult> {
  return prisma.$transaction((tx) => cancelReceiptInTx(tx, userId, receiptId, options))
}

/** The goods that could be received against a bill or an order, for the form. */
export function getReceivable(source: ReceiveSource) {
  return prisma.$transaction((tx) => loadReceivable(tx, source))
}

// ---------------------------------------------------------------------------
// The same two jobs with the activity-trail lines the web actions write, for
// callers that have no server action around them (the mobile API).

type ReceiptActor = { id: string; name: string }

/** Posts a goods receipt and logs it on the receipt, its bill and its order. */
export async function postReceiptLogged(
  actor: ReceiptActor,
  input: ReceiveInput,
): Promise<ReceiveResult & { billId?: string | null; poId?: string | null }> {
  const result = await receiveGoods(actor.id, input)

  if (!result.ok || !result.receipt) return result

  const receipt = await prisma.goodsReceipt.findUnique({
    where: { id: result.receipt.id },
    select: { id: true, billId: true, poId: true },
  })

  await logActivity({
    entity: 'goods-receipt',
    id: result.receipt.id,
    action: 'created',
    summary: `received goods (${result.receipt.lineCount} line${result.receipt.lineCount === 1 ? '' : 's'})`,
    actor,
  })

  if (receipt?.billId) {
    await logActivity({
      entity: 'purchase-bill',
      id: receipt.billId,
      action: 'received',
      summary: `received goods against this bill (${result.receipt.number})`,
      actor,
    })
  }

  if (receipt?.poId) {
    await logActivity({
      entity: 'purchase-order',
      id: receipt.poId,
      action: 'received',
      summary: `received goods against this order (${result.receipt.number})`,
      actor,
    })
  }

  return { ...result, billId: receipt?.billId ?? null, poId: receipt?.poId ?? null }
}

/** Cancels a receipt (reversing its stock) and logs it. */
export async function cancelReceiptLogged(
  actor: ReceiptActor,
  receiptId: string,
  options: { allowNegative?: boolean } = {},
): Promise<CancelResult> {
  const result = await cancelReceipt(actor.id, receiptId, options)

  if (!result.ok || result.alreadyCancelled) return result

  await logActivity({
    entity: 'goods-receipt',
    id: receiptId,
    action: 'cancelled',
    summary: options.allowNegative ? 'cancelled the receipt (allowed negative stock)' : 'cancelled the receipt',
    actor,
  })

  return result
}
