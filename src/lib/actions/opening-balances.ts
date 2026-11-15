'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/session'
import type { SimpleResult } from '@/lib/actions/quotations'
import { saveOpeningBalances as saveBalances } from '@/lib/services/adjustments'

export type { SimpleResult }

/**
 * Saves the cash and bank balance each payment mode held when books were
 * opened here. The amount can be negative. Blank amount removes the entry.
 */
export async function saveOpeningBalances(
  input: { channelId: string; amount: string; asOf: string }[],
): Promise<SimpleResult> {
  const user = await requireCapability('settings:update')
  const result = await saveBalances({ userId: user.id, name: user.name }, input)

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/settings/opening-balances')
  revalidatePath('/reports/payment-methods')

  return { ok: true, message: result.message }
}
