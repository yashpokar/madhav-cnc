'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { logActivity } from '@/lib/activity'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import { cancelReceipt, receiveGoods, type ReceiveSource } from '@/lib/services/goods-receipts'

export type { FormState, SimpleResult }

const inputSchema = z.object({
  billId: z.string().trim().optional(),
  poId: z.string().trim().optional(),
  receivedOn: z.coerce.date({ error: 'Enter the date the goods arrived' }),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => value || null),
  lines: z
    .array(
      z.object({
        lineId: z.string().min(1),
        qty: z.coerce.number().min(0).max(99_999_999),
      }),
    )
    .max(500),
})

const actorOf = (user: { id: string; name: string }) => ({ id: user.id, name: user.name })

function revalidateAround(opts: { receiptId?: string; billId?: string | null; poId?: string | null }) {
  revalidatePath('/goods-receipts')
  revalidatePath('/stock')
  revalidatePath('/purchase-bills')
  revalidatePath('/purchase-orders')

  if (opts.receiptId) revalidatePath(`/goods-receipts/${opts.receiptId}`)
  if (opts.billId) revalidatePath(`/purchase-bills/${opts.billId}`)
  if (opts.poId) revalidatePath(`/purchase-orders/${opts.poId}`)
}

/** Posts a goods receipt from the form: against a posted bill or a sent order. */
export async function createReceipt(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('stock:create')

  let lines: unknown = []

  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    lines = []
  }

  const parsed = inputSchema.safeParse({
    billId: formData.get('billId') || undefined,
    poId: formData.get('poId') || undefined,
    receivedOn: formData.get('receivedOn'),
    notes: formData.get('notes') ?? undefined,
    lines,
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const { billId, poId } = parsed.data
  const source: ReceiveSource | null = billId
    ? { kind: 'bill', billId }
    : poId
      ? { kind: 'order', poId }
      : null

  if (!source) return { status: 'error', message: 'Choose a purchase order or a bill to receive against' }

  const result = await receiveGoods(user.id, {
    source,
    receivedOn: parsed.data.receivedOn,
    notes: parsed.data.notes,
    lines: parsed.data.lines,
  })

  if (!result.ok) return { status: 'error', message: result.error, values: rawValues(formData) }

  if (!result.receipt) return { status: 'error', message: 'Nothing was left to receive' }

  const receipt = await prisma.goodsReceipt.findUnique({
    where: { id: result.receipt.id },
    select: { id: true, billId: true, poId: true },
  })

  await logActivity({
    entity: 'goods-receipt',
    id: result.receipt.id,
    action: 'created',
    summary: `received goods (${result.receipt.lineCount} line${result.receipt.lineCount === 1 ? '' : 's'})`,
    actor: actorOf(user),
  })

  if (receipt?.billId) {
    await logActivity({
      entity: 'purchase-bill',
      id: receipt.billId,
      action: 'received',
      summary: `received goods against this bill (${result.receipt.number})`,
      actor: actorOf(user),
    })
  }

  if (receipt?.poId) {
    await logActivity({
      entity: 'purchase-order',
      id: receipt.poId,
      action: 'received',
      summary: `received goods against this order (${result.receipt.number})`,
      actor: actorOf(user),
    })
  }

  revalidateAround({ receiptId: result.receipt.id, billId: receipt?.billId, poId: receipt?.poId })
  redirect(`/goods-receipts/${result.receipt.id}?created=1`)
}

/**
 * Cancels a receipt and reverses its stock. Stock going below zero is refused
 * unless an administrator says to allow it.
 */
export async function cancelReceiptAction(
  id: string,
  allowNegative = false,
): Promise<SimpleResult> {
  const user = await requireCapability('stock:update')
  const result = await cancelReceipt(user.id, id, {
    allowNegative: allowNegative && user.role === 'ADMIN',
  })

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.code === 'NEGATIVE_STOCK' && user.role === 'ADMIN'
          ? `${result.error} As an administrator you can use "Cancel, allow negative stock".`
          : result.error,
    }
  }

  if (result.alreadyCancelled) return { ok: true, message: `${result.number} is already cancelled` }

  const receipt = await prisma.goodsReceipt.findUnique({
    where: { id },
    select: { billId: true, poId: true },
  })

  await logActivity({
    entity: 'goods-receipt',
    id,
    action: 'cancelled',
    summary: allowNegative ? 'cancelled the receipt (allowed negative stock)' : 'cancelled the receipt',
    actor: actorOf(user),
  })

  revalidateAround({ receiptId: id, billId: receipt?.billId, poId: receipt?.poId })

  return { ok: true, message: `${result.number} cancelled and its stock reversed` }
}
