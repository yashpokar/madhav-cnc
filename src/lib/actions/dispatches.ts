'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { nextDispatchNumber } from '@/lib/codes'
import { dispatchInputSchema } from '@/lib/validation/dispatches'
import type { DispatchData } from '@/lib/validation/dispatches'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import { DispatchStatus } from '@/generated/prisma/enums'

export type { FormState, SimpleResult }

const COUNTS_AS_SENT: DispatchStatus[] = ['DRAFT', 'DISPATCHED', 'DELIVERED']

function parse(formData: FormData) {
  let lines: unknown = []

  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    lines = []
  }

  return dispatchInputSchema.safeParse({
    orderId: formData.get('orderId'),
    dispatchDate: formData.get('dispatchDate'),
    status: formData.get('status') ?? undefined,
    vehicleNumber: formData.get('vehicleNumber'),
    driverName: formData.get('driverName'),
    driverPhone: formData.get('driverPhone'),
    transporterName: formData.get('transporterName'),
    lrNumber: formData.get('lrNumber'),
    deliveryAddress: formData.get('deliveryAddress'),
    deliveryCity: formData.get('deliveryCity'),
    deliveryPincode: formData.get('deliveryPincode'),
    notes: formData.get('notes'),
    lines,
  })
}

async function assertQuantities(data: DispatchData, excludeDispatchId?: string) {
  const orderLines = await prisma.orderLine.findMany({
    where: { orderId: data.orderId },
    select: {
      id: true,
      description: true,
      quantity: true,
      dispatchLines: {
        where: {
          dispatch: {
            status: { in: COUNTS_AS_SENT },
            ...(excludeDispatchId ? { id: { not: excludeDispatchId } } : {}),
          },
        },
        select: { quantity: true },
      },
    },
  })

  const byId = new Map(orderLines.map((line) => [line.id, line]))

  for (const line of data.lines) {
    const orderLine = byId.get(line.orderLineId)

    if (!orderLine) {
      return 'A line does not belong to this order'
    }

    const already = orderLine.dispatchLines.reduce(
      (sum, entry) => sum + entry.quantity.toNumber(),
      0,
    )
    const remaining = orderLine.quantity.toNumber() - already

    if (line.quantity > remaining + 0.0005) {
      return `${orderLine.description}: only ${Math.round(remaining * 1000) / 1000} left to dispatch`
    }
  }

  return null
}

export async function createDispatch(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('dispatch:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    select: { id: true, status: true },
  })

  if (!order) {
    return { status: 'error', message: 'Order not found' }
  }

  if (order.status === 'CANCELLED' || order.status === 'DRAFT') {
    return {
      status: 'error',
      message: 'This order is not ready to dispatch',
    }
  }

  const quantityError = await assertQuantities(parsed.data)

  if (quantityError) {
    return { status: 'error', message: quantityError }
  }

  const number = await nextDispatchNumber()

  const dispatch = await prisma.dispatch.create({
    data: {
      number,
      status: parsed.data.status,
      orderId: parsed.data.orderId,
      dispatchDate: parsed.data.dispatchDate,
      vehicleNumber: parsed.data.vehicleNumber,
      driverName: parsed.data.driverName,
      driverPhone: parsed.data.driverPhone,
      transporterName: parsed.data.transporterName,
      lrNumber: parsed.data.lrNumber,
      deliveryAddress: parsed.data.deliveryAddress,
      deliveryCity: parsed.data.deliveryCity,
      deliveryPincode: parsed.data.deliveryPincode,
      notes: parsed.data.notes,
      createdById: user.id,
      updatedById: user.id,
      lines: {
        create: parsed.data.lines.map((line, index) => ({
          position: index + 1,
          orderLineId: line.orderLineId,
          description: line.description,
          unit: line.unit,
          quantity: line.quantity,
        })),
      },
    },
  })

  revalidatePath('/dispatch')
  revalidatePath(`/orders/${parsed.data.orderId}`)
  redirect(`/dispatch/${dispatch.id}?created=1`)
}

export async function updateDispatch(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('dispatch:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const existing = await prisma.dispatch.findUnique({
    where: { id },
    select: { id: true, status: true, orderId: true },
  })

  if (!existing) {
    return { status: 'error', message: 'Delivery challan not found' }
  }

  if (existing.status === 'DELIVERED' || existing.status === 'CANCELLED') {
    return {
      status: 'error',
      message: `A ${existing.status.toLowerCase()} challan can no longer be edited`,
    }
  }

  const quantityError = await assertQuantities(parsed.data, id)

  if (quantityError) {
    return { status: 'error', message: quantityError }
  }

  await prisma.$transaction([
    prisma.dispatchLine.deleteMany({ where: { dispatchId: id } }),
    prisma.dispatch.update({
      where: { id },
      data: {
        dispatchDate: parsed.data.dispatchDate,
        vehicleNumber: parsed.data.vehicleNumber,
        driverName: parsed.data.driverName,
        driverPhone: parsed.data.driverPhone,
        transporterName: parsed.data.transporterName,
        lrNumber: parsed.data.lrNumber,
        deliveryAddress: parsed.data.deliveryAddress,
        deliveryCity: parsed.data.deliveryCity,
        deliveryPincode: parsed.data.deliveryPincode,
        notes: parsed.data.notes,
        updatedById: user.id,
        lines: {
          create: parsed.data.lines.map((line, index) => ({
            position: index + 1,
            orderLineId: line.orderLineId,
            description: line.description,
            unit: line.unit,
            quantity: line.quantity,
          })),
        },
      },
    }),
  ])

  revalidatePath('/dispatch')
  revalidatePath(`/dispatch/${id}`)

  return { status: 'success', message: 'Delivery challan saved', id }
}

const ALLOWED_TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  DRAFT: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'DRAFT', 'CANCELLED'],
  DELIVERED: ['DISPATCHED'],
  CANCELLED: [],
}

export async function setDispatchStatus(
  id: string,
  status: DispatchStatus,
): Promise<SimpleResult> {
  const user = await requireCapability('dispatch:update')

  const existing = await prisma.dispatch.findUnique({
    where: { id },
    select: { status: true, orderId: true, number: true },
  })

  if (!existing) {
    return { ok: false, error: 'Delivery challan not found' }
  }

  if (!ALLOWED_TRANSITIONS[existing.status].includes(status)) {
    return {
      ok: false,
      error: `A ${existing.status.toLowerCase()} challan cannot move to ${status.toLowerCase()}`,
    }
  }

  await prisma.dispatch.update({
    where: { id },
    data: {
      status,
      deliveredAt: status === 'DELIVERED' ? new Date() : null,
      updatedById: user.id,
    },
  })

  if (status === 'DISPATCHED') {
    const order = await prisma.order.findUnique({
      where: { id: existing.orderId },
      select: { status: true },
    })

    if (order && (order.status === 'READY' || order.status === 'IN_PRODUCTION')) {
      await prisma.order.update({
        where: { id: existing.orderId },
        data: { status: 'DISPATCHED' },
      })
    }
  }

  revalidatePath('/dispatch')
  revalidatePath(`/dispatch/${id}`)
  revalidatePath(`/orders/${existing.orderId}`)

  return { ok: true, message: `${existing.number} marked ${status.toLowerCase()}` }
}

const receiptSchema = z.object({
  receivedByName: z.string().trim().min(1, 'Enter who received it').max(120),
})

export async function recordReceipt(
  id: string,
  receivedByName: string,
): Promise<SimpleResult> {
  const user = await requireCapability('dispatch:update')

  const parsed = receiptSchema.safeParse({ receivedByName })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const existing = await prisma.dispatch.findUnique({
    where: { id },
    select: { status: true, orderId: true },
  })

  if (!existing) {
    return { ok: false, error: 'Delivery challan not found' }
  }

  if (existing.status === 'CANCELLED') {
    return { ok: false, error: 'This challan was cancelled' }
  }

  await prisma.dispatch.update({
    where: { id },
    data: {
      status: 'DELIVERED',
      receivedByName: parsed.data.receivedByName,
      receivedAt: new Date(),
      deliveredAt: new Date(),
      updatedById: user.id,
    },
  })

  const remaining = await prisma.orderLine.findMany({
    where: { orderId: existing.orderId },
    select: {
      quantity: true,
      dispatchLines: {
        where: { dispatch: { status: 'DELIVERED' } },
        select: { quantity: true },
      },
    },
  })

  const fullyDelivered = remaining.every((line) => {
    const delivered = line.dispatchLines.reduce(
      (sum, entry) => sum + entry.quantity.toNumber(),
      0,
    )

    return delivered >= line.quantity.toNumber() - 0.0005
  })

  if (fullyDelivered) {
    const order = await prisma.order.findUnique({
      where: { id: existing.orderId },
      select: { status: true },
    })

    if (order && order.status === 'DISPATCHED') {
      await prisma.order.update({
        where: { id: existing.orderId },
        data: { status: 'COMPLETED' },
      })
    }
  }

  revalidatePath('/dispatch')
  revalidatePath(`/dispatch/${id}`)
  revalidatePath(`/orders/${existing.orderId}`)

  return {
    ok: true,
    message: fullyDelivered
      ? 'Receipt recorded. The order is fully delivered.'
      : 'Receipt recorded',
  }
}
