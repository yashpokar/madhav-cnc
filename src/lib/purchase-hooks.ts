import type { prisma } from '@/lib/prisma'

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

/**
 * Called inside the posting transaction, once, when a bill moves from draft
 * to posted. Nothing happens here yet. The stock PR fills this in (receiving
 * goods, moving stock) so that posting and its side effects commit or roll
 * back together. Throwing aborts the post.
 */
export async function onBillPosted(tx: PurchaseTx, bill: HookBill): Promise<void> {
  void tx
  void bill
}

/**
 * Called inside the same kind of transaction when a posted bill is cancelled
 * or sent back to draft, so whatever onBillPosted did can be undone. Does
 * nothing yet.
 */
export async function onBillCancelled(
  tx: PurchaseTx,
  bill: HookBill,
  reason: 'cancelled' | 'unposted' = 'cancelled',
): Promise<void> {
  void tx
  void bill
  void reason
}
