'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/session'
import * as orders from '@/lib/services/orders'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { SimpleResult }

// Thin adapters over the tracking-link functions in src/lib/services/orders.ts.

export async function createTrackingLink(
  orderId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('order:update')
  const result = await orders.createTrackingLink(
    { userId: user.id, name: user.name },
    orderId,
    process.env.PUBLIC_BASE_URL ?? null,
  )

  if (!result.ok) return result

  if (result.created) {
    revalidatePath(`/orders/${orderId}`)
  }

  return { ok: true, message: result.message, id: result.token }
}

export async function revokeTrackingLink(
  orderId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('order:update')
  const result = await orders.revokeTrackingLink({ userId: user.id, name: user.name }, orderId)

  if (!result.ok) return result

  revalidatePath(`/orders/${orderId}`)

  return { ok: true, message: result.message }
}

/** Swaps the link for a fresh one in one step; the old link stops opening. */
export async function replaceTrackingLink(
  orderId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('order:update')
  const result = await orders.replaceTrackingLink(
    { userId: user.id, name: user.name },
    orderId,
    process.env.PUBLIC_BASE_URL ?? null,
  )

  if (!result.ok) return result

  revalidatePath(`/orders/${orderId}`)

  return { ok: true, message: result.message, id: result.token }
}
