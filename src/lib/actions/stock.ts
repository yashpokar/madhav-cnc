'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/session'
import { logActivity } from '@/lib/activity'
import type { SimpleResult } from '@/lib/actions/quotations'
import { adjustStock, setOpeningStock, type StockKind } from '@/lib/services/stock'

export type { SimpleResult }

const isKind = (kind: string): kind is StockKind => kind === 'item' || kind === 'material'

function refresh(kind: StockKind, id: string) {
  revalidatePath('/stock')
  revalidatePath(`/stock/${kind}/${id}`)
}

/** Adds (+) or removes (-) stock by hand, with a reason. */
export async function adjustStockAction(input: {
  kind: string
  id: string
  qty: number
  reason: string
  date?: string
  allowNegative?: boolean
}): Promise<SimpleResult> {
  const user = await requireCapability('stock:create')

  if (!isKind(input.kind)) return { ok: false, error: 'Not found' }

  const result = await adjustStock(user.id, {
    target: { kind: input.kind, id: input.id },
    qty: input.qty,
    reason: input.reason,
    date: input.date,
    allowNegative: input.allowNegative === true && user.role === 'ADMIN',
  })

  if (!result.ok) return { ok: false, error: result.error }

  await logActivity({
    entity: 'stock',
    id: input.id,
    action: 'adjusted',
    summary: `adjusted stock by ${input.qty > 0 ? '+' : ''}${input.qty} (${input.reason.trim()})`,
    actor: { id: user.id, name: user.name },
  })

  refresh(input.kind, input.id)

  return { ok: true, message: `Stock adjusted. ${result.onHand} on hand.` }
}

/** Records the opening stock: a quantity and what each unit cost. */
export async function openingStockAction(input: {
  kind: string
  id: string
  qty: number
  unitCost: number
  date?: string
}): Promise<SimpleResult> {
  const user = await requireCapability('stock:create')

  if (!isKind(input.kind)) return { ok: false, error: 'Not found' }

  const result = await setOpeningStock(user.id, {
    target: { kind: input.kind, id: input.id },
    qty: input.qty,
    unitCost: input.unitCost,
    date: input.date,
  })

  if (!result.ok) return { ok: false, error: result.error }

  await logActivity({
    entity: 'stock',
    id: input.id,
    action: 'opening',
    summary: `set opening stock to ${input.qty} at ${input.unitCost} each`,
    actor: { id: user.id, name: user.name },
  })

  refresh(input.kind, input.id)

  return { ok: true, message: `Opening stock set. ${result.onHand} on hand.` }
}
