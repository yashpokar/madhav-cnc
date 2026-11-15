import type { prisma } from '@/lib/prisma'
import { receiveGoodsInTx } from '@/lib/services/goods-receipts'

/** The transaction client handed to the callback of prisma.$transaction. */
export type PurchaseTx = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0]

/** What a hook needs to know about the bill, with its lines. */
export type HookBill = {
  id: string
  number: string
  vendorId: string
  poId: string | null
  billDate: Date
  lines: {
    id: string
    itemId: string | null
    materialId: string | null
    description: string
    qty: number
    unit: string
    rate: number
  }[]
}

/** Thrown by a hook to refuse the status change with a message for the user. */
export class PurchaseHookError extends Error {}

export type PostOptions = {
  /** The person posting; recorded on the receipt and its stock movements. */
  userId?: string | null
  /** Also receive every line in full, as part of posting. */
  receiveNow?: boolean
}

/**
 * Called inside the posting transaction, once, when a bill moves from draft
 * to posted. Posting does not receive goods by itself (receiving is explicit);
 * only when asked (`receiveNow`) does it create a full goods receipt here, so
 * posting and receiving commit or roll back together. Throwing aborts the post.
 */
export async function onBillPosted(
  tx: PurchaseTx,
  bill: HookBill,
  options: PostOptions = {},
): Promise<void> {
  if (!options.receiveNow) return

  const result = await receiveGoodsInTx(tx, options.userId ?? null, {
    source: { kind: 'bill', billId: bill.id },
    receivedOn: new Date(`${bill.billDate.toISOString().slice(0, 10)}T00:00:00Z`),
    notes: `Received when ${bill.number} was posted`,
    lines: 'all',
  })

  if (!result.ok) throw new PurchaseHookError(result.error)
}

/**
 * Called inside the same kind of transaction when a posted bill is cancelled
 * or sent back to draft. A bill with a posted goods receipt cannot go back:
 * the receipt (and its stock) has to be cancelled first.
 */
export async function onBillCancelled(
  tx: PurchaseTx,
  bill: HookBill,
  reason: 'cancelled' | 'unposted' = 'cancelled',
): Promise<void> {
  void reason

  const receipts = await tx.goodsReceipt.findMany({
    where: { billId: bill.id, status: 'POSTED' },
    select: { number: true },
  })

  if (receipts.length > 0) {
    throw new PurchaseHookError(
      `Cancel the goods receipt first (${receipts.map((receipt) => receipt.number).join(', ')}).`,
    )
  }
}
