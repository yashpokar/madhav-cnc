// Delivery challan (dispatch) writes: create, edit, status moves, recording the
// receipt and delete, as plain functions that take the acting user and
// JSON-native input, so the web server actions and the mobile API run the same
// code. No cookies, redirects, FormData or cache revalidation in here.
//
// Company scope: every function runs inside a company scope (the web's active
// company cookie, or the API's X-Company-Id). Orders, order lines and challans
// of another company are invisible, so they are "not found"; callers never pass
// a companyId. The dispatch:* capabilities are checked by the adapters; the
// state rules (order not draft/cancelled, quantities left, allowed status
// moves, no edit after delivery) are re-checked here. The status machine and
// the quantity maths live in src/lib/dispatch-rules.ts.
//
// The challan number is drawn from the company counter just before the insert;
// the challan and its lines are one nested create (atomic). Activity is logged
// here so web and API both leave a trail.

import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { nextDispatchNumber } from '@/lib/codes'
import {
  dispatchInputSchema,
  dispatchReceiptSchema,
  type DispatchData,
  type DispatchInput,
} from '@/lib/validation/dispatches'
import {
  COUNTS_AS_SENT,
  canTransition,
  dispatchStatusText,
  isFullyDelivered,
  quantityProblem,
  type DispatchState,
} from '@/lib/dispatch-rules'

export type DispatchActor = { id: string; name: string }

export type DispatchSaveResult =
  | { ok: true; id: string; number: string; orderId: string }
  | {
      ok: false
      error: string
      /** Set when the input failed validation: field path -> message. */
      fieldErrors?: Record<string, string>
    }

export type DispatchResult =
  | {
      ok: true
      message: string
      /** The order the challan belongs to, for cache revalidation by the caller. */
      orderId?: string
    }
  | { ok: false; error: string }

const actorLog = (actor: DispatchActor) => ({ id: actor.id, name: actor.name })

/** Validates JSON-native input; returns the parsed data or the failure to hand back. */
export function parseDispatchInput(
  input: DispatchInput,
): { ok: true; data: DispatchData } | Extract<DispatchSaveResult, { ok: false }> {
  const parsed = dispatchInputSchema.safeParse(input)

  if (parsed.success) {
    return { ok: true, data: parsed.data }
  }

  const fieldErrors: Record<string, string> = {}

  for (const issue of parsed.error.issues) {
    const key = issue.path.map(String).join('.')

    if (key && !fieldErrors[key]) {
      fieldErrors[key] = issue.message
    }
  }

  return { ok: false, error: 'Please correct the highlighted fields', fieldErrors }
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

  return quantityProblem(
    orderLines.map((line) => ({
      id: line.id,
      description: line.description,
      ordered: line.quantity.toNumber(),
      alreadySent: line.dispatchLines.reduce(
        (sum, entry) => sum + entry.quantity.toNumber(),
        0,
      ),
    })),
    data.lines,
  )
}

const lineRows = (data: DispatchData) =>
  data.lines.map((line, index) => ({
    position: index + 1,
    orderLineId: line.orderLineId,
    description: line.description,
    unit: line.unit,
    quantity: line.quantity,
  }))

export async function createDispatch(
  actor: DispatchActor,
  input: DispatchInput,
): Promise<DispatchSaveResult> {
  const parsed = parseDispatchInput(input)

  if (!parsed.ok) {
    return parsed
  }

  const data = parsed.data

  const order = await prisma.order.findUnique({
    where: { id: data.orderId },
    select: { id: true, status: true, number: true },
  })

  if (!order) {
    return { ok: false, error: 'Order not found' }
  }

  if (order.status === 'CANCELLED' || order.status === 'DRAFT') {
    return { ok: false, error: 'This order is not ready to dispatch' }
  }

  const quantityError = await assertQuantities(data)

  if (quantityError) {
    return { ok: false, error: quantityError }
  }

  const number = await nextDispatchNumber()

  const dispatch = await prisma.dispatch.create({
    data: {
      number,
      status: data.status,
      orderId: data.orderId,
      dispatchDate: data.dispatchDate,
      vehicleNumber: data.vehicleNumber,
      driverName: data.driverName,
      driverPhone: data.driverPhone,
      transporterName: data.transporterName,
      lrNumber: data.lrNumber,
      deliveryAddress: data.deliveryAddress,
      deliveryCity: data.deliveryCity,
      deliveryPincode: data.deliveryPincode,
      notes: data.notes,
      createdById: actor.id,
      updatedById: actor.id,
      lines: { create: lineRows(data) },
    },
  })

  await logActivity({
    entity: 'dispatch',
    id: dispatch.id,
    action: 'created',
    summary: `created the challan for order ${order.number}`,
    actor: actorLog(actor),
  })
  await logActivity({
    entity: 'order',
    id: order.id,
    action: 'dispatch',
    summary: `created challan ${dispatch.number}`,
    actor: actorLog(actor),
  })

  return { ok: true, id: dispatch.id, number: dispatch.number, orderId: order.id }
}

export async function updateDispatch(
  actor: DispatchActor,
  id: string,
  input: DispatchInput,
): Promise<DispatchSaveResult> {
  const parsed = parseDispatchInput(input)

  if (!parsed.ok) {
    return parsed
  }

  const data = parsed.data

  const existing = await prisma.dispatch.findUnique({
    where: { id },
    select: { id: true, status: true, orderId: true, number: true },
  })

  if (!existing) {
    return { ok: false, error: 'Delivery challan not found' }
  }

  if (existing.status === 'DELIVERED' || existing.status === 'CANCELLED') {
    return {
      ok: false,
      error: `A ${existing.status.toLowerCase()} challan can no longer be edited`,
    }
  }

  const quantityError = await assertQuantities(data, id)

  if (quantityError) {
    return { ok: false, error: quantityError }
  }

  await prisma.$transaction([
    prisma.dispatchLine.deleteMany({ where: { dispatchId: id } }),
    prisma.dispatch.update({
      where: { id },
      data: {
        dispatchDate: data.dispatchDate,
        vehicleNumber: data.vehicleNumber,
        driverName: data.driverName,
        driverPhone: data.driverPhone,
        transporterName: data.transporterName,
        lrNumber: data.lrNumber,
        deliveryAddress: data.deliveryAddress,
        deliveryCity: data.deliveryCity,
        deliveryPincode: data.deliveryPincode,
        notes: data.notes,
        updatedById: actor.id,
        lines: { create: lineRows(data) },
      },
    }),
  ])

  await logActivity({
    entity: 'dispatch',
    id,
    action: 'updated',
    summary: 'edited the challan',
    actor: actorLog(actor),
  })

  return { ok: true, id, number: existing.number, orderId: existing.orderId }
}

export async function setDispatchStatus(
  actor: DispatchActor,
  id: string,
  status: DispatchState,
): Promise<DispatchResult> {
  const existing = await prisma.dispatch.findUnique({
    where: { id },
    select: { status: true, orderId: true, number: true },
  })

  if (!existing) {
    return { ok: false, error: 'Delivery challan not found' }
  }

  if (!canTransition(existing.status, status)) {
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
      updatedById: actor.id,
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

  const statusText = dispatchStatusText(status)

  await logActivity({
    entity: 'dispatch',
    id,
    action: 'status',
    summary: `marked the challan as ${statusText}`,
    actor: actorLog(actor),
  })

  if (status === 'DISPATCHED' || status === 'DELIVERED') {
    await logActivity({
      entity: 'order',
      id: existing.orderId,
      action: 'dispatch',
      summary: `challan ${existing.number} ${statusText}`,
      actor: actorLog(actor),
    })
  }

  return {
    ok: true,
    orderId: existing.orderId,
    message: `${existing.number} marked ${status.toLowerCase()}`,
  }
}

export async function recordReceipt(
  actor: DispatchActor,
  id: string,
  receivedByName: string,
): Promise<DispatchResult> {
  const parsed = dispatchReceiptSchema.safeParse({ receivedByName })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const existing = await prisma.dispatch.findUnique({
    where: { id },
    select: { status: true, orderId: true, number: true },
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
      updatedById: actor.id,
    },
  })

  const lines = await prisma.orderLine.findMany({
    where: { orderId: existing.orderId },
    select: {
      quantity: true,
      dispatchLines: {
        where: { dispatch: { status: 'DELIVERED' } },
        select: { quantity: true },
      },
    },
  })

  const fullyDelivered = isFullyDelivered(
    lines.map((line) => ({
      ordered: line.quantity.toNumber(),
      delivered: line.dispatchLines.reduce(
        (sum, entry) => sum + entry.quantity.toNumber(),
        0,
      ),
    })),
  )

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

  await logActivity({
    entity: 'dispatch',
    id,
    action: 'status',
    summary: `recorded delivery (received by ${parsed.data.receivedByName})`,
    actor: actorLog(actor),
  })
  await logActivity({
    entity: 'order',
    id: existing.orderId,
    action: 'dispatch',
    summary: `challan ${existing.number} delivered`,
    actor: actorLog(actor),
  })

  return {
    ok: true,
    orderId: existing.orderId,
    message: fullyDelivered
      ? 'Receipt recorded. The order is fully delivered.'
      : 'Receipt recorded',
  }
}

export async function deleteDispatch(
  actor: DispatchActor,
  id: string,
): Promise<DispatchResult> {
  const dispatch = await prisma.dispatch.findUnique({
    where: { id },
    select: { number: true, status: true, orderId: true },
  })

  if (!dispatch) {
    return { ok: false, error: 'Dispatch not found' }
  }

  if (dispatch.status !== 'DRAFT' && dispatch.status !== 'CANCELLED') {
    return {
      ok: false,
      error: 'Goods have already left. Cancel the dispatch before deleting it.',
    }
  }

  await prisma.dispatch.delete({ where: { id } })

  await logActivity({
    entity: 'order',
    id: dispatch.orderId,
    action: 'dispatch',
    summary: `deleted challan ${dispatch.number}`,
    actor: actorLog(actor),
  })

  return { ok: true, orderId: dispatch.orderId, message: `${dispatch.number} deleted` }
}
