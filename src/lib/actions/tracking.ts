'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { SimpleResult }

export async function createTrackingLink(
  orderId: string,
): Promise<SimpleResult> {
  await requireCapability('order:update')

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

  const token = randomBytes(24).toString('base64url')

  await prisma.order.update({
    where: { id: orderId },
    data: { trackingToken: token },
  })

  revalidatePath(`/orders/${orderId}`)

  return { ok: true, message: 'Tracking link created', id: token }
}

export async function revokeTrackingLink(
  orderId: string,
): Promise<SimpleResult> {
  await requireCapability('order:update')

  const result = await prisma.order.updateMany({
    where: { id: orderId, trackingToken: { not: null } },
    data: { trackingToken: null },
  })

  if (result.count === 0) {
    return { ok: false, error: 'There is no active tracking link' }
  }

  revalidatePath(`/orders/${orderId}`)

  return { ok: true, message: 'Tracking link revoked' }
}
