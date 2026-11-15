'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { detailsColumn, resolvePaymentMode } from '@/lib/payment-modes'
import { parsePaymentDetails } from '@/lib/payment-methods'
import { requireCapability } from '@/lib/session'
import { nextOrderNumber } from '@/lib/codes'
import { applySizeRule, documentTotals, lineTotals } from '@/lib/pricing'
import { orderInputSchema } from '@/lib/validation/orders'
import type { OrderData } from '@/lib/validation/orders'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import { ensureTasksForOrder } from '@/lib/actions/production'
import { logActivity } from '@/lib/activity'
import { describeOrderDelete } from '@/lib/order-delete'
import { getOrderImpact } from '@/lib/queries/orders'
import { isDayKey, scheduleFromFields } from '@/lib/calendar'
import { findScheduleConflicts } from '@/lib/queries/calendar'
import { ORDER_STATUS_LABELS } from '@/lib/labels'
import { OrderStatus } from '@/generated/prisma/enums'

/**
 * The advance taken on an order is kept as a receipt (so it shows in Payments)
 * tied to the order. It is never applied to an invoice; the
 * invoice deducts it as "advance adjusted", so it is not counted twice.
 */
async function syncAdvancePayment(
  order: { id: string; number: string },
  data: OrderData,
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

export type { FormState, SimpleResult }

function parse(formData: FormData) {
  let lines: unknown = []

  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    lines = []
  }

  return orderInputSchema.safeParse({
    customerId: formData.get('customerId'),
    architectId: formData.get('architectId'),
    carpenterId: formData.get('carpenterId'),
    subject: formData.get('subject'),
    customerPoNumber: formData.get('customerPoNumber'),
    orderDate: formData.get('orderDate'),
    dueDate: formData.get('dueDate'),
    startDate: formData.get('startDate'),
    startTime: formData.get('startTime'),
    endDate: formData.get('endDate'),
    endTime: formData.get('endTime'),
    venue: formData.get('venue'),
    headcount: formData.get('headcount'),
    siteAddress: formData.get('siteAddress'),
    siteCity: formData.get('siteCity'),
    sitePincode: formData.get('sitePincode'),
    status: formData.get('status') ?? undefined,
    discountType: formData.get('discountType') ?? undefined,
    discountValue: formData.get('discountValue') || 0,
    advanceAmount: formData.get('advanceAmount') || 0,
    advanceChannelId: formData.get('advanceChannelId') ?? undefined,
    advancePaymentDetails: formData.get('advancePaymentDetails') ?? undefined,
    transportCharge: formData.get('transportCharge') || 0,
    transportTaxRatePercent: formData.get('transportTaxRatePercent') || 0,
    notes: formData.get('notes'),
    terms: formData.get('terms'),
    lines,
  })
}

async function assertReferences(data: OrderData) {
  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId },
    select: { id: true },
  })

  if (!customer) {
    return 'Selected customer no longer exists'
  }

  if (data.advanceAmount > 0) {
    const method = await resolvePaymentMode(data.advanceChannelId)

    if (!method) return 'Choose how the advance was paid'

    const details = parsePaymentDetails(method.mode, data.advancePaymentDetails, 'in')

    if (!details.ok) return `Advance: ${details.error}`
  }

  const partnerIds = [data.architectId, data.carpenterId].filter(
    Boolean,
  ) as string[]

  if (partnerIds.length > 0) {
    const partners = await prisma.partner.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, type: true },
    })
    const byId = new Map(partners.map((partner) => [partner.id, partner.type]))

    if (data.architectId && byId.get(data.architectId) !== 'ARCHITECT') {
      return 'Selected architect is not an architect'
    }

    if (data.carpenterId && byId.get(data.carpenterId) !== 'CARPENTER') {
      return 'Selected carpenter is not a carpenter'
    }
  }

  return null
}

function buildPersistable(input: OrderData) {
  const data = { ...input, lines: input.lines.map(applySizeRule) }

  const totals = documentTotals({
    lines: data.lines,
    discountType: data.discountType,
    discountValue: data.discountValue,
    transportCharge: data.transportCharge,
    transportTaxRatePercent: data.transportTaxRatePercent,
  })

  const lines = data.lines.map((line, index) => {
    const computed = lineTotals(line)

    return {
      position: index + 1,
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
      amount: computed.amount,
      taxAmount: computed.taxAmount,
      lineTotal: computed.lineTotal,
      notes: line.notes,
    }
  })

  return { totals, lines }
}

// Work can be corrected until the order is cancelled; once it is invoiced,
// the invoice is the record, so the order is locked (checked in updateOrder).
const EDITABLE_STATUSES: OrderStatus[] = ['DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'COMPLETED']

export async function createOrder(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('order:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const referenceError = await assertReferences(parsed.data)

  if (referenceError) {
    return { status: 'error', message: referenceError }
  }

  const { totals, lines } = buildPersistable(parsed.data)
  const number = await nextOrderNumber()

  const order = await prisma.order.create({
    data: {
      number,
      status: parsed.data.status,
      customerId: parsed.data.customerId,
      architectId: parsed.data.architectId,
      carpenterId: parsed.data.carpenterId,
      subject: parsed.data.subject,
      customerPoNumber: parsed.data.customerPoNumber,
      orderDate: parsed.data.orderDate,
      dueDate: parsed.data.dueDate,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      venue: parsed.data.venue,
      headcount: parsed.data.headcount,
      siteAddress: parsed.data.siteAddress,
      siteCity: parsed.data.siteCity,
      sitePincode: parsed.data.sitePincode,
      discountType: parsed.data.discountType,
      discountValue: parsed.data.discountValue,
      advanceAmount: parsed.data.advanceAmount,
      transportCharge: parsed.data.transportCharge,
      transportTaxRatePercent: parsed.data.transportTaxRatePercent,
      notes: parsed.data.notes,
      terms: parsed.data.terms,
      ...totals,
      createdById: user.id,
      updatedById: user.id,
      lines: { create: lines },
    },
  })

  await syncAdvancePayment(order, parsed.data, user.id)

  await logActivity({
    entity: 'order',
    id: order.id,
    action: 'created',
    summary: 'created the order',
    actor: { id: user.id, name: user.name },
  })

  revalidatePath('/orders')
  redirect(`/orders/${order.id}?created=1`)
}

export async function updateOrder(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('order:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true, status: true, _count: { select: { invoices: true } } },
  })

  if (!existing) {
    return { status: 'error', message: 'Order not found' }
  }

  if (existing._count.invoices > 0) {
    return {
      status: 'error',
      message: 'This order has been invoiced, so it is locked. Change the invoice instead.',
    }
  }

  if (!EDITABLE_STATUSES.includes(existing.status)) {
    return {
      status: 'error',
      message: `An order that is ${existing.status.toLowerCase().replace('_', ' ')} can no longer be edited`,
    }
  }

  const referenceError = await assertReferences(parsed.data)

  if (referenceError) {
    return { status: 'error', message: referenceError }
  }

  const { totals, lines } = buildPersistable(parsed.data)

  await prisma.$transaction([
    prisma.orderLine.deleteMany({ where: { orderId: id } }),
    prisma.order.update({
      where: { id },
      data: {
        status: parsed.data.status,
        customerId: parsed.data.customerId,
        architectId: parsed.data.architectId,
        carpenterId: parsed.data.carpenterId,
          subject: parsed.data.subject,
        customerPoNumber: parsed.data.customerPoNumber,
        orderDate: parsed.data.orderDate,
        dueDate: parsed.data.dueDate,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        venue: parsed.data.venue,
        headcount: parsed.data.headcount,
        siteAddress: parsed.data.siteAddress,
        siteCity: parsed.data.siteCity,
        sitePincode: parsed.data.sitePincode,
        discountType: parsed.data.discountType,
        discountValue: parsed.data.discountValue,
        advanceAmount: parsed.data.advanceAmount,
        transportCharge: parsed.data.transportCharge,
        transportTaxRatePercent: parsed.data.transportTaxRatePercent,
        notes: parsed.data.notes,
        terms: parsed.data.terms,
        ...totals,
        updatedById: user.id,
        lines: { create: lines },
      },
    }),
  ])

  const saved = await prisma.order.findUniqueOrThrow({
    where: { id },
    select: { id: true, number: true },
  })

  await syncAdvancePayment(saved, parsed.data, user.id)
  revalidatePath('/payments')

  await logActivity({
    entity: 'order',
    id,
    action: 'updated',
    summary: 'edited the order',
    actor: { id: user.id, name: user.name },
  })

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)

  return { status: 'success', message: 'Order saved', id }
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PRODUCTION', 'CANCELLED', 'DRAFT'],
  IN_PRODUCTION: ['READY', 'CANCELLED'],
  READY: ['DISPATCHED', 'IN_PRODUCTION'],
  DISPATCHED: ['COMPLETED', 'READY'],
  COMPLETED: [],
  CANCELLED: [],
}

export async function setOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<SimpleResult> {
  const user = await requireCapability('order:update')

  const existing = await prisma.order.findUnique({
    where: { id },
    select: { status: true },
  })

  if (!existing) {
    return { ok: false, error: 'Order not found' }
  }

  if (!ALLOWED_TRANSITIONS[existing.status].includes(status)) {
    const from = existing.status.toLowerCase().replace('_', ' ')
    const to = status.toLowerCase().replace('_', ' ')

    return { ok: false, error: `An order that is ${from} cannot move to ${to}` }
  }

  await prisma.order.update({
    where: { id },
    data: { status, updatedById: user.id },
  })

  if (status === 'IN_PRODUCTION') {
    await ensureTasksForOrder(id)
  }

  await logActivity({
    entity: 'order',
    id,
    action: 'status',
    summary: `moved the order to ${ORDER_STATUS_LABELS[status].toLowerCase()}`,
    actor: { id: user.id, name: user.name },
  })

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  revalidatePath('/production')

  return { ok: true, message: `Marked as ${status.toLowerCase().replace('_', ' ')}` }
}

export async function convertQuotationToOrder(
  quotationId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('order:create')

  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: { lines: { orderBy: { position: 'asc' } } },
  })

  if (!quotation) {
    return { ok: false, error: 'Quotation not found' }
  }

  if (quotation.status !== 'ACCEPTED' && quotation.status !== 'CONVERTED') {
    return {
      ok: false,
      error: 'Only an accepted quotation can be turned into an order',
    }
  }

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
        createdById: user.id,
        updatedById: user.id,
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
        data: { status: 'CONVERTED', updatedById: user.id },
      })
    }

    return created
  })

  const actor = { id: user.id, name: user.name }

  await logActivity({
    entity: 'order',
    id: order.id,
    action: 'created',
    summary: `created the order from quotation ${quotation.number}`,
    actor,
  })
  await logActivity({
    entity: 'quotation',
    id: quotation.id,
    action: 'converted',
    summary: `converted to order ${order.number}`,
    actor,
  })

  revalidatePath('/orders')
  revalidatePath('/quotations')
  revalidatePath(`/quotations/${quotationId}`)

  return { ok: true, message: `Order ${order.number} created`, id: order.id }
}

export async function deleteOrder(id: string): Promise<SimpleResult> {
  const user = await requireCapability('order:delete')

  const [order, impact] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      select: { number: true, quotationId: true, customerId: true },
    }),
    getOrderImpact(id),
  ])

  if (!order || !impact) {
    return { ok: false, error: 'Order not found' }
  }

  const { blocked } = describeOrderDelete(impact)

  if (blocked) {
    return { ok: false, error: blocked }
  }

  // The advance stays as the customer's money on account; say where it came from.
  if (impact.advance) {
    await prisma.payment.updateMany({
      where: { orderId: id },
      data: { notes: `Advance for order ${order.number} (order deleted)` },
    })
  }

  await prisma.$transaction(async (tx) => {
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

  revalidatePath('/orders')
  revalidatePath('/production')
  revalidatePath('/quotations')
  revalidatePath('/payments')

  await logActivity({
    entity: 'customer',
    id: order.customerId,
    action: 'order',
    summary: `deleted order ${order.number}`,
    actor: { id: user.id, name: user.name },
  })

  return { ok: true, message: `${order.number} deleted` }
}

export type ConflictResult = {
  conflicts: { id: string; number: string; customerName: string }[]
}

/**
 * A heads-up, never a block: other live orders overlapping the chosen time.
 * Called from the order form as the dates change.
 */
export async function checkScheduleConflicts(input: {
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  excludeId?: string | null
}): Promise<ConflictResult> {
  await requireCapability('order:read')

  if (!isDayKey(input.startDate) || (input.endDate && !isDayKey(input.endDate))) {
    return { conflicts: [] }
  }

  const clock = /^([01]\d|2[0-3]):[0-5]\d$/
  const { startsAt, endsAt } = scheduleFromFields({
    ...input,
    startTime: clock.test(input.startTime) ? input.startTime : '',
    endTime: clock.test(input.endTime) ? input.endTime : '',
  })

  if (!startsAt || (endsAt && endsAt < startsAt)) {
    return { conflicts: [] }
  }

  return { conflicts: await findScheduleConflicts({ startsAt, endsAt, excludeId: input.excludeId }) }
}
