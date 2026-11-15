'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/session'
import type { AdjustmentInput } from '@/lib/validation/adjustments'
import type { SimpleResult } from '@/lib/actions/quotations'
import {
  createAdjustment as createAdjustmentService,
  deleteAdjustment as deleteAdjustmentService,
  updateAdjustment as updateAdjustmentService,
} from '@/lib/services/adjustments'

export type { SimpleResult }

// Creating, correcting and removing adjustments all need settings:update: they
// move money balances without a source document, so they sit with the other
// opening-balance powers rather than with day-to-day payment entry.
// Anyone with payment:read can see the list.

function refresh() {
  revalidatePath('/adjustments')
  revalidatePath('/reports/payment-methods')
  revalidatePath('/settings/opening-balances')
  revalidatePath('/customers')
  revalidatePath('/payments')
  revalidatePath('/')
}

export async function createAdjustment(input: AdjustmentInput): Promise<SimpleResult> {
  const user = await requireCapability('settings:update')
  const result = await createAdjustmentService({ userId: user.id, name: user.name }, input)

  if (!result.ok) return { ok: false, error: result.error }

  refresh()

  return { ok: true, message: result.message, id: result.id }
}

/** Corrects the amount, date, reason or note. What was adjusted stays fixed. */
export async function updateAdjustment(
  id: string,
  input: AdjustmentInput,
): Promise<SimpleResult> {
  const user = await requireCapability('settings:update')
  const result = await updateAdjustmentService({ userId: user.id, name: user.name }, id, input)

  if (!result.ok) return { ok: false, error: result.error }

  refresh()

  return { ok: true, message: result.message }
}

/** Removing an adjustment puts the balance back exactly as it was before it. */
export async function deleteAdjustment(id: string): Promise<SimpleResult> {
  const user = await requireCapability('settings:update')
  const result = await deleteAdjustmentService({ userId: user.id, name: user.name }, id)

  if (!result.ok) return { ok: false, error: result.error }

  refresh()

  return { ok: true, message: result.message }
}
