'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { logActivity } from '@/lib/activity'
import { newShareToken } from '@/lib/share-token'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { SimpleResult }

export async function createTrackingLink(
  orderId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('order:update')

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { trackingToken: true, status: true },
  })

  if (!order) {
    return { ok: false, error: 'Order not found' }
  }

  if (order.trackingToken) {
    return { ok: true, message: 'Link ready', id: order.trackingToken }
  }

  if (order.status === 'CANCELLED') {
    return { ok: false, error: 'A cancelled order cannot be tracked' }
  }

  const token = newShareToken()

  await prisma.order.update({
    where: { id: orderId },
    data: { trackingToken: token },
  })

  await logActivity({
    entity: 'order',
    id: orderId,
    action: 'tracking',
    summary: 'created the tracking link',
    actor: { id: user.id, name: user.name },
  })

  revalidatePath(`/orders/${orderId}`)

  return { ok: true, message: 'Tracking link created', id: token }
}

export async function revokeTrackingLink(
  orderId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('order:update')

  const result = await prisma.order.updateMany({
    where: { id: orderId, trackingToken: { not: null } },
    data: { trackingToken: null },
  })

  if (result.count === 0) {
    return { ok: false, error: 'There is no active tracking link' }
  }

  await logActivity({
    entity: 'order',
    id: orderId,
    action: 'tracking',
    summary: 'revoked the tracking link',
    actor: { id: user.id, name: user.name },
  })

  revalidatePath(`/orders/${orderId}`)

  return { ok: true, message: 'Tracking link revoked' }
}

/** Swaps the link for a fresh one in one step; the old link stops opening. */
export async function replaceTrackingLink(
  orderId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('order:update')

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  })

  if (!order) {
    return { ok: false, error: 'Order not found' }
  }

  if (order.status === 'CANCELLED') {
    return { ok: false, error: 'A cancelled order cannot be tracked' }
  }

  const token = newShareToken()

  await prisma.order.update({
    where: { id: orderId },
    data: { trackingToken: token },
  })

  await logActivity({
    entity: 'order',
    id: orderId,
    action: 'tracking',
    summary: 'replaced the tracking link (the old link no longer opens)',
    actor: { id: user.id, name: user.name },
  })

  revalidatePath(`/orders/${orderId}`)

  return {
    ok: true,
    message: 'New link created. The old one no longer opens.',
    id: token,
  }
}
