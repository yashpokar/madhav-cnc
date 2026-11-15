'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/session'
import type { SimpleResult } from '@/lib/actions/quotations'
import type { PaymentModeInput } from '@/lib/validation/payment-modes'
import {
  addPaymentMode as addMode,
  deletePaymentMode as deleteMode,
  movePaymentMode as moveMode,
  setPaymentModeActive as setModeActive,
  updatePaymentMode as updateMode,
} from '@/lib/services/payment-methods'

export type { SimpleResult }

function refresh() {
  revalidatePath('/settings/payment-modes')
  revalidatePath('/payments')
  revalidatePath('/expenses')
}

/** Adds a payment mode at the end of the list. */
export async function addPaymentMode(input: PaymentModeInput): Promise<SimpleResult> {
  await requireCapability('settings:update')

  const result = await addMode(input)

  if (!result.ok) return { ok: false, error: result.error }

  refresh()

  return { ok: true, message: result.message, id: result.id }
}

/**
 * Renames a mode or changes its kind. Past payments keep the name they were
 * recorded with; only new ones use the new name.
 */
export async function updatePaymentMode(
  id: string,
  input: PaymentModeInput,
): Promise<SimpleResult> {
  await requireCapability('settings:update')

  const result = await updateMode(id, input)

  if (!result.ok) return { ok: false, error: result.error }

  refresh()

  return { ok: true, message: result.message }
}

/** Hides a mode from the pickers, or brings it back. At least one must stay active. */
export async function setPaymentModeActive(id: string, active: boolean): Promise<SimpleResult> {
  await requireCapability('settings:update')

  const result = await setModeActive(id, active)

  if (!result.ok) return { ok: false, error: result.error }

  refresh()

  return { ok: true, message: result.message }
}

/** Moves a mode one place up or down in the pickers. */
export async function movePaymentMode(id: string, direction: 'up' | 'down'): Promise<SimpleResult> {
  await requireCapability('settings:update')

  const result = await moveMode(id, direction)

  if (!result.ok) return { ok: false, error: result.error }

  refresh()

  return { ok: true, message: result.message }
}

/** Deletes a mode that was never used. Used ones can only be hidden. */
export async function deletePaymentMode(id: string): Promise<SimpleResult> {
  await requireCapability('settings:update')

  const result = await deleteMode(id)

  if (!result.ok) return { ok: false, error: result.error }

  refresh()

  return { ok: true, message: result.message }
}
