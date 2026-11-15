// Order business logic as plain functions: no cookies, headers, FormData,
// redirect or revalidatePath. The server actions in src/lib/actions/orders.ts
// and tracking.ts are thin adapters (permission check, FormData -> input,
// result -> FormState/SimpleResult, revalidate); the mobile API calls these
// same functions.
//
// Every function runs inside a company scope: the web's active-company cookie
// or the API's X-Company-Id. The scope layer (company-scope.ts) filters each
// query to that company and refuses a write that points at another company's
// row, so none of these takes a companyId from the caller.
//
// Permissions are checked by the caller (web: requireCapability, API: the
// capability in apiRoute). The state rules (locked once invoiced, allowed
// status moves, delete blockers) are re-checked here. Activity logging lives
// here so web and API both leave a trail.
//
// Numbering: the order number comes from the company's counter (codes.ts), one
// atomic statement consumed just before the insert; a failed insert wastes a
// number, it can never duplicate one. Where several rows are written together
// (convert, delete) they share one transaction, and child rows are created in a
// single nested create so the scope layer can check their foreign keys.

import { prisma } from '@/lib/prisma'
import { detailsColumn, resolvePaymentMode } from '@/lib/payment-modes'
import { parsePaymentDetails } from '@/lib/payment-methods'
import { nextOrderNumber } from '@/lib/codes'
import { documentTotals } from '@/lib/pricing'
import { logActivity } from '@/lib/activity'
import { describeOrderDelete } from '@/lib/order-delete'
import { getOrderImpact } from '@/lib/queries/orders'
import { findScheduleConflicts } from '@/lib/queries/calendar'
import { ensureTasksForOrder } from '@/lib/actions/production'
import { newShareToken } from '@/lib/share-token'
import { ORDER_STATUS_LABELS } from '@/lib/labels'
import { trackingShareParts, type ShareLinkParts } from '@/lib/share-links'
import {
  canConvertQuotation,
  canTrackOrder,
  orderEditError,
  orderStatusMessage,
  orderTransitionError,
  scheduleWindow,
} from '@/lib/sales-rules'
import {
  buildLineRows,
  checkCustomer,
  checkPartners,
  resolveActor,
  type Actor,
  type ServiceResult,
} from '@/lib/services/sales-shared'
import type { OrderServiceInput } from '@/lib/validation/orders'
import type { OrderStatus } from '@/generated/prisma/enums'

export type { Actor, ServiceResult, OrderServiceInput as OrderInput }

/**
 * The advance taken on an order is kept as a receipt (so it shows in Payments)
 * tied to the order. It is never applied to an invoice; the
 * invoice deducts it as "advance adjusted", so it is not counted twice.
 */
async function syncAdvancePayment(
  order: { id: string; number: string },
  data: OrderServiceInput,
  recordedById: string,
) {
  const existing = await prisma.payment.findUnique({
    where: { orderId: order.id },
    select: { id: true },
  })

  if (data.advanceAmount <= 0) {
    if (existing) {
      await prisma.payment.delete({ where: { id: existing.id } })
    }

    return
  }

  const method = await resolvePaymentMode(data.advanceChannelId)
  const details = method ? parsePaymentDetails(method.mode, data.advancePaymentDetails, 'in') : null

  const fields = {
    ...(details?.ok
      ? { reference: details.reference, paymentDetails: detailsColumn(details.details) }
      : {}),
    customerId: data.customerId,
    amount: data.advanceAmount,
    ...(method
      ? { mode: method.mode, channelId: method.channelId, modeName: method.modeName }
      : {}),
    paidOn: data.orderDate,
    notes: `Advance for order ${order.number}`,
  }

  if (existing) {
    await prisma.payment.update({ where: { id: existing.id }, data: fields })
  } else {
    await prisma.payment.create({
      data: {
        ...fields,
        number: `ADV-${order.number}`,
        orderId: order.id,
        recordedById,
      },
    })
  }
}

async function assertReferences(data: OrderServiceInput) {
  const customerError = await checkCustomer(data.customerId)

  if (customerError) return customerError

  if (data.advanceAmount > 0) {
    const method = await resolvePaymentMode(data.advanceChannelId)

    if (!method) return 'Choose how the advance was paid'

    const details = parsePaymentDetails(method.mode, data.advancePaymentDetails, 'in')

    if (!details.ok) return `Advance: ${details.error}`
  }

  return checkPartners(data)
}

function buildPersistable(input: OrderServiceInput) {
  const { lines, rows } = buildLineRows(input.lines)

  const totals = documentTotals({
    lines,
    discountType: input.discountType,
    discountValue: input.discountValue,
    transportCharge: input.transportCharge,
    transportTaxRatePercent: input.transportTaxRatePercent,
  })

  return { totals, lines: rows }
}

function headerFields(data: OrderServiceInput) {
  return {
    status: data.status,
    customerId: data.customerId,
    architectId: data.architectId,
    carpenterId: data.carpenterId,
    subject: data.subject,
    customerPoNumber: data.customerPoNumber,
    orderDate: data.orderDate,
    dueDate: data.dueDate,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    venue: data.venue,
    headcount: data.headcount,
    siteAddress: data.siteAddress,
    siteCity: data.siteCity,
    sitePincode: data.sitePincode,
    discountType: data.discountType,
    discountValue: data.discountValue,
    advanceAmount: data.advanceAmount,
    transportCharge: data.transportCharge,
    transportTaxRatePercent: data.transportTaxRatePercent,
    notes: data.notes,
    terms: data.terms,
  }
}

/** Creates an order with its priced lines, and its advance receipt when one was taken. */
export async function createOrder(
  actor: Actor,
  input: OrderServiceInput,
): Promise<ServiceResult<{ id: string; number: string }>> {
  const referenceError = await assertReferences(input)

  if (referenceError) return { ok: false, error: referenceError }

  const who = await resolveActor(actor)
  const { totals, lines } = buildPersistable(input)
  const number = await nextOrderNumber()

  const order = await prisma.order.create({
    data: {
      number,
      ...headerFields(input),
      ...totals,
      createdById: who.id,
      updatedById: who.id,
      lines: { create: lines },
    },
  })

  await syncAdvancePayment(order, input, who.id)

  await logActivity({
    entity: 'order',
    id: order.id,
    action: 'created',
    summary: 'created the order',
    actor: who,
  })

  return { ok: true, message: 'Order created', id: order.id, number }
}

/**
 * Replaces an order's header, schedule and lines and re-syncs its advance
 * receipt. Locked once invoiced, and once cancelled/dispatched (see
 * sales-rules.ts).
 */
export async function updateOrder(
  actor: Actor,
  id: string,
  input: OrderServiceInput,
): Promise<ServiceResult<{ id: string }>> {
  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true, status: true, _count: { select: { invoices: true } } },
  })

  if (!existing) return { ok: false, error: 'Order not found' }

  const locked = orderEditError({
    status: existing.status,
    invoiceCount: existing._count.invoices,
  })

  if (locked) return { ok: false, error: locked }

  const referenceError = await assertReferences(input)

  if (referenceError) return { ok: false, error: referenceError }

  const who = await resolveActor(actor)
  const { totals, lines } = buildPersistable(input)

  await prisma.$transaction([
    prisma.orderLine.deleteMany({ where: { orderId: id } }),
    prisma.order.update({
      where: { id },
      data: {
        ...headerFields(input),
        ...totals,
        updatedById: who.id,
        lines: { create: lines },
      },
    }),
  ])

  const saved = await prisma.order.findUniqueOrThrow({
    where: { id },
    select: { id: true, number: true },
  })

  await syncAdvancePayment(saved, input, who.id)

  await logActivity({
    entity: 'order',
    id,
    action: 'updated',
    summary: 'edited the order',
    actor: who,
  })

  return { ok: true, message: 'Order saved', id }
}

/** Moves an order along its status table; entering production creates its stage tasks. */
export async function setOrderStatus(
  actor: Actor,
  id: string,
  status: OrderStatus,
): Promise<ServiceResult<{ id: string; status: OrderStatus }>> {
  const existing = await prisma.order.findUnique({
    where: { id },
    select: { status: true },
  })

  if (!existing) return { ok: false, error: 'Order not found' }

  const refused = orderTransitionError(existing.status, status)

  if (refused) return { ok: false, error: refused }

  const who = await resolveActor(actor)

  await prisma.order.update({
    where: { id },
    data: { status, updatedById: who.id },
  })

  if (status === 'IN_PRODUCTION') {
    await ensureTasksForOrder(id)
  }

  await logActivity({
    entity: 'order',
    id,
    action: 'status',
    summary: `moved the order to ${ORDER_STATUS_LABELS[status].toLowerCase()}`,
    actor: who,
  })

  return { ok: true, message: orderStatusMessage(status), id, status }
}

/**
 * Turns an accepted quotation into a confirmed order (copying its lines and
 * totals) and marks the quotation converted, in one transaction.
 */
export async function convertQuotationToOrder(
  actor: Actor,
  quotationId: string,
): Promise<ServiceResult<{ id: string; number: string; quotationId: string }>> {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: { lines: { orderBy: { position: 'asc' } } },
  })

  if (!quotation) return { ok: false, error: 'Quotation not found' }

  if (!canConvertQuotation(quotation.status)) {
    return { ok: false, error: 'Only an accepted quotation can be turned into an order' }
  }

  const who = await resolveActor(actor)
  const number = await nextOrderNumber()

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        number,
        status: 'CONFIRMED',
        quotationId: quotation.id,
        customerId: quotation.customerId,
        architectId: quotation.architectId,
        carpenterId: quotation.carpenterId,
        subject: quotation.subject,
        orderDate: new Date(),
        siteAddress: quotation.siteAddress,
        siteCity: quotation.siteCity,
        sitePincode: quotation.sitePincode,
        discountType: quotation.discountType,
        discountValue: quotation.discountValue,
        subtotal: quotation.subtotal,
        discountAmount: quotation.discountAmount,
        taxableAmount: quotation.taxableAmount,
        taxAmount: quotation.taxAmount,
        roundOff: quotation.roundOff,
        total: quotation.total,
        notes: quotation.notes,
        terms: quotation.terms,
        createdById: who.id,
        updatedById: who.id,
        lines: {
          create: quotation.lines.map((line) => ({
            position: line.position,
            itemId: line.itemId,
            description: line.description,
            unit: line.unit,
            materialSupply: line.materialSupply,
            isFlatRate: line.isFlatRate,
            autoSize: line.autoSize,
            dimensionUnit: line.dimensionUnit,
            length: line.length,
            width: line.width,
            pieces: line.pieces,
            quantity: line.quantity,
            rate: line.rate,
            discountPercent: line.discountPercent,
            taxRatePercent: line.taxRatePercent,
            hsnCode: line.hsnCode,
            amount: line.amount,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            notes: line.notes,
          })),
        },
      },
    })

    if (quotation.status !== 'CONVERTED') {
      await tx.quotation.update({
        where: { id: quotation.id },
        data: { status: 'CONVERTED', updatedById: who.id },
      })
    }

    return created
  })

  await logActivity({
    entity: 'order',
    id: order.id,
    action: 'created',
    summary: `created the order from quotation ${quotation.number}`,
    actor: who,
  })
  await logActivity({
    entity: 'quotation',
    id: quotation.id,
    action: 'converted',
    summary: `converted to order ${order.number}`,
    actor: who,
  })

  return {
    ok: true,
    message: `Order ${order.number} created`,
    id: order.id,
    number: order.number,
    quotationId: quotation.id,
  }
}

/**
 * Deletes an order unless an invoice or challan points at it. The advance
 * receipt stays as the customer's money on account, and a quotation whose last
 * order this was goes back to accepted.
 */
export async function deleteOrder(
  actor: Actor,
  id: string,
): Promise<ServiceResult<{ number: string }>> {
  const [order, impact] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      select: { number: true, quotationId: true, customerId: true },
    }),
    getOrderImpact(id),
  ])

  if (!order || !impact) return { ok: false, error: 'Order not found' }

  const { blocked } = describeOrderDelete(impact)

  if (blocked) return { ok: false, error: blocked }

  const who = await resolveActor(actor)

  await prisma.$transaction(async (tx) => {
    // The advance stays as the customer's money on account; say where it came from.
    if (impact.advance) {
      await tx.payment.updateMany({
        where: { orderId: id },
        data: { notes: `Advance for order ${order.number} (order deleted)` },
      })
    }

    await tx.order.delete({ where: { id } })

    // A converted quotation goes back to accepted when its last order goes.
    if (order.quotationId) {
      const remaining = await tx.order.count({
        where: { quotationId: order.quotationId },
      })

      if (remaining === 0) {
        await tx.quotation.updateMany({
          where: { id: order.quotationId, status: 'CONVERTED' },
          data: { status: 'ACCEPTED' },
        })
      }
    }
  })

  await logActivity({
    entity: 'customer',
    id: order.customerId,
    action: 'order',
    summary: `deleted order ${order.number}`,
    actor: who,
  })

  return { ok: true, message: `${order.number} deleted`, number: order.number }
}

export type ScheduleConflicts = {
  conflicts: { id: string; number: string; customerName: string }[]
}

/**
 * A heads-up, never a block: other live orders overlapping the chosen time.
 * Strings are what the order form holds ('yyyy-mm-dd', 'HH:mm'); anything
 * unusable simply has no conflicts.
 */
export async function findOrderScheduleConflicts(input: {
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  excludeId?: string | null
}): Promise<ScheduleConflicts> {
  const window = scheduleWindow(input)

  if (!window) return { conflicts: [] }

  return { conflicts: await findScheduleConflicts({ ...window, excludeId: input.excludeId }) }
}

export type TrackingLinkResult = ServiceResult<ShareLinkParts & { created: boolean }>

async function trackingParts(orderId: string, token: string, baseUrl: string | null) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { number: true, customer: { select: { name: true, phone: true } } },
  })

  return trackingShareParts({
    baseUrl,
    token,
    customerName: order.customer.name,
    customerPhone: order.customer.phone,
    orderNumber: order.number,
  })
}

/** The customer tracking link for an order: returns the existing one, or creates it. */
export async function createTrackingLink(
  actor: Actor,
  orderId: string,
  baseUrl: string | null,
): Promise<TrackingLinkResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { trackingToken: true, status: true },
  })

  if (!order) return { ok: false, error: 'Order not found' }

  if (order.trackingToken) {
    return {
      ok: true,
      message: 'Link ready',
      created: false,
      ...(await trackingParts(orderId, order.trackingToken, baseUrl)),
    }
  }

  if (!canTrackOrder(order.status)) {
    return { ok: false, error: 'A cancelled order cannot be tracked' }
  }

  const who = await resolveActor(actor)
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
    actor: who,
  })

  return {
    ok: true,
    message: 'Tracking link created',
    created: true,
    ...(await trackingParts(orderId, token, baseUrl)),
  }
}

/** Stops the tracking link from opening. */
export async function revokeTrackingLink(
  actor: Actor,
  orderId: string,
): Promise<ServiceResult> {
  const result = await prisma.order.updateMany({
    where: { id: orderId, trackingToken: { not: null } },
    data: { trackingToken: null },
  })

  if (result.count === 0) return { ok: false, error: 'There is no active tracking link' }

  const who = await resolveActor(actor)

  await logActivity({
    entity: 'order',
    id: orderId,
    action: 'tracking',
    summary: 'revoked the tracking link',
    actor: who,
  })

  return { ok: true, message: 'Tracking link revoked' }
}

/** Swaps the link for a fresh one in one step; the old link stops opening. */
export async function replaceTrackingLink(
  actor: Actor,
  orderId: string,
  baseUrl: string | null,
): Promise<TrackingLinkResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  })

  if (!order) return { ok: false, error: 'Order not found' }

  if (!canTrackOrder(order.status)) {
    return { ok: false, error: 'A cancelled order cannot be tracked' }
  }

  const who = await resolveActor(actor)
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
    actor: who,
  })

  return {
    ok: true,
    message: 'New link created. The old one no longer opens.',
    created: true,
    ...(await trackingParts(orderId, token, baseUrl)),
  }
}
