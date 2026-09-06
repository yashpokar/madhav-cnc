'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { nextOrderNumber } from '@/lib/codes'
import { documentTotals, lineTotals } from '@/lib/pricing'
import { orderInputSchema } from '@/lib/validation/orders'
import type { OrderData } from '@/lib/validation/orders'
import type { FormState } from '@/lib/actions/partners'
import type { SimpleResult } from '@/lib/actions/quotations'
import { ensureTasksForOrder } from '@/lib/actions/production'
import { OrderStatus } from '@/generated/prisma/enums'

export type { FormState, SimpleResult }

function fieldErrorsFrom(error: {
  issues: { path: PropertyKey[]; message: string }[]
}) {
  const fieldErrors: Record<string, string> = {}

  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.')

    if (key && !fieldErrors[key]) {
      fieldErrors[key] = issue.message
    }
  }

  return fieldErrors
}

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
    materialSupply: formData.get('materialSupply') ?? undefined,
    subject: formData.get('subject'),
    customerPoNumber: formData.get('customerPoNumber'),
    orderDate: formData.get('orderDate'),
    dueDate: formData.get('dueDate'),
    siteAddress: formData.get('siteAddress'),
    siteCity: formData.get('siteCity'),
    sitePincode: formData.get('sitePincode'),
    status: formData.get('status') ?? undefined,
    discountType: formData.get('discountType') ?? undefined,
    discountValue: formData.get('discountValue') || 0,
    advanceAmount: formData.get('advanceAmount') || 0,
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

function buildPersistable(data: OrderData) {
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

const EDITABLE_STATUSES: OrderStatus[] = ['DRAFT', 'CONFIRMED']

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
      materialSupply: parsed.data.materialSupply,
      subject: parsed.data.subject,
      customerPoNumber: parsed.data.customerPoNumber,
      orderDate: parsed.data.orderDate,
      dueDate: parsed.data.dueDate,
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
    }
  }

  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true, status: true },
  })

  if (!existing) {
    return { status: 'error', message: 'Order not found' }
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
        materialSupply: parsed.data.materialSupply,
        subject: parsed.data.subject,
        customerPoNumber: parsed.data.customerPoNumber,
        orderDate: parsed.data.orderDate,
        dueDate: parsed.data.dueDate,
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

  if (quotation.status === 'CONVERTED') {
    return { ok: false, error: 'This quotation has already been converted' }
  }

  if (quotation.status !== 'ACCEPTED') {
    return {
      ok: false,
      error: 'Only an accepted quotation can be converted to an order',
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
        materialSupply: quotation.materialSupply,
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

    await tx.quotation.update({
      where: { id: quotation.id },
      data: { status: 'CONVERTED', updatedById: user.id },
    })

    return created
  })

  revalidatePath('/orders')
  revalidatePath('/quotations')
  revalidatePath(`/quotations/${quotationId}`)

  return { ok: true, message: `Order ${order.number} created`, id: order.id }
}
