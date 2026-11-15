'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireCompanyId } from '@/lib/active-company'
import { requireCapability } from '@/lib/session'
import { nextPurchaseBillNumber, nextPurchaseOrderNumber } from '@/lib/codes'
import { logActivity } from '@/lib/activity'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import { orderInputSchema, type OrderData } from '@/lib/validation/purchases'
import {
  billTotals,
  canEditOrder,
  canMoveOrder,
  defaultDueDate,
  orderLineTotal,
  suggestInterState,
  todayIso,
} from '@/lib/purchase-rules'
import type { PurchaseOrderStatus } from '@/generated/prisma/enums'

export type { FormState, SimpleResult }

const actorOf = (user: { id: string; name: string }) => ({
  id: user.id,
  name: user.name,
})

function parse(formData: FormData) {
  let lines: unknown = []

  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    lines = []
  }

  return orderInputSchema.safeParse({
    vendorId: formData.get('vendorId'),
    orderDate: formData.get('orderDate'),
    expectedDate: formData.get('expectedDate'),
    notes: formData.get('notes'),
    lines,
  })
}

async function checkReferences(data: OrderData): Promise<string | null> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: data.vendorId },
    select: { id: true },
  })

  if (!vendor) return 'Vendor not found'

  const itemIds = [...new Set(data.lines.flatMap((l) => (l.itemId ? [l.itemId] : [])))]
  const materialIds = [
    ...new Set(data.lines.flatMap((l) => (l.materialId ? [l.materialId] : []))),
  ]

  if (itemIds.length > 0) {
    const found = await prisma.item.count({ where: { id: { in: itemIds } } })
    if (found !== itemIds.length) return 'An item on a line was not found'
  }

  if (materialIds.length > 0) {
    const found = await prisma.material.count({ where: { id: { in: materialIds } } })
    if (found !== materialIds.length) return 'A material on a line was not found'
  }

  return null
}

function orderLines(data: OrderData) {
  return data.lines.map((line, index) => ({
    itemId: line.itemId,
    materialId: line.materialId,
    description: line.description,
    qty: line.qty,
    unit: line.unit,
    rate: line.rate,
    taxRatePercent: line.taxRatePercent,
    lineTotal: orderLineTotal(line),
    sortOrder: index,
  }))
}

export async function createOrder(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('purchase:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const problem = await checkReferences(parsed.data)

  if (problem) return { status: 'error', message: problem }

  const number = await nextPurchaseOrderNumber()

  const order = await prisma.purchaseOrder.create({
    data: {
      number,
      status: 'DRAFT',
      vendorId: parsed.data.vendorId,
      orderDate: parsed.data.orderDate,
      expectedDate: parsed.data.expectedDate,
      notes: parsed.data.notes,
      lines: { create: orderLines(parsed.data) },
    },
  })

  await logActivity({
    entity: 'purchase-order',
    id: order.id,
    action: 'created',
    summary: 'created the purchase order',
    actor: actorOf(user),
  })

  revalidatePath('/purchase-orders')
  redirect(`/purchase-orders/${order.id}?created=1`)
}

export async function updateOrder(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('purchase:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { status: true },
  })

  if (!existing) return { status: 'error', message: 'Purchase order not found' }

  if (!canEditOrder(existing.status)) {
    return {
      status: 'error',
      message: 'This purchase order can no longer be edited.',
    }
  }

  const problem = await checkReferences(parsed.data)

  if (problem) return { status: 'error', message: problem }

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderLine.deleteMany({ where: { poId: id } })
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        vendorId: parsed.data.vendorId,
        orderDate: parsed.data.orderDate,
        expectedDate: parsed.data.expectedDate,
        notes: parsed.data.notes,
        lines: { create: orderLines(parsed.data) },
      },
    })
  })

  await logActivity({
    entity: 'purchase-order',
    id,
    action: 'updated',
    summary: 'edited the purchase order',
    actor: actorOf(user),
  })

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${id}`)

  return { status: 'success', message: 'Purchase order saved', id }
}

const SUMMARY: Partial<Record<PurchaseOrderStatus, string>> = {
  SENT: 'marked the purchase order as sent',
  CANCELLED: 'cancelled the purchase order',
  DRAFT: 'moved the purchase order back to draft',
}

export async function setOrderStatus(
  id: string,
  status: PurchaseOrderStatus,
): Promise<SimpleResult> {
  const user = await requireCapability('purchase:update')

  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { status: true, number: true },
  })

  if (!existing) return { ok: false, error: 'Purchase order not found' }

  if (existing.status === status) {
    return { ok: true, message: `${existing.number} is already ${status.toLowerCase()}` }
  }

  const move = canMoveOrder(existing.status, status)

  if (!move.ok) return { ok: false, error: move.reason }

  // Conditional on the status we read, so a double click changes it once.
  const claimed = await prisma.purchaseOrder.updateMany({
    where: { id, status: existing.status },
    data: { status },
  })

  if (claimed.count === 0) {
    return { ok: false, error: 'This order was changed by someone else. Refresh and try again.' }
  }

  await logActivity({
    entity: 'purchase-order',
    id,
    action: 'status',
    summary: SUMMARY[status] ?? `marked the purchase order ${status.toLowerCase()}`,
    actor: actorOf(user),
  })

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${id}`)

  return { ok: true, message: `${existing.number} marked ${status.toLowerCase()}` }
}

export async function deleteOrder(id: string): Promise<SimpleResult> {
  await requireCapability('purchase:delete')

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      number: true,
      status: true,
      _count: { select: { bills: true, receipts: true } },
    },
  })

  if (!order) return { ok: false, error: 'Purchase order not found' }

  if (order.status !== 'DRAFT' && order.status !== 'CANCELLED') {
    return { ok: false, error: 'Cancel this purchase order before deleting it' }
  }

  if (order._count.bills > 0 || order._count.receipts > 0) {
    return { ok: false, error: 'Bills or receipts refer to this purchase order.' }
  }

  await prisma.purchaseOrder.delete({ where: { id } })

  revalidatePath('/purchase-orders')

  return { ok: true, message: `${order.number} deleted` }
}

/** Copies an order's lines into a new draft bill linked back to the order. */
export async function createBillFromOrder(id: string): Promise<SimpleResult> {
  const user = await requireCapability('purchase:create')

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: { select: { gstin: true } },
      lines: { orderBy: { sortOrder: 'asc' } },
    },
  })

  if (!order) return { ok: false, error: 'Purchase order not found' }

  if (order.status === 'CANCELLED') {
    return { ok: false, error: 'A cancelled purchase order cannot be billed' }
  }

  if (order.lines.length === 0) {
    return { ok: false, error: 'This purchase order has no lines' }
  }

  const company = await prisma.companySetting.findUnique({
    where: { id: await requireCompanyId() },
    select: { gstin: true },
  })

  const isInterState = suggestInterState(company?.gstin ?? null, order.vendor.gstin)
  const today = todayIso()
  const { totals, lines } = billTotals(
    order.lines.map((line) => ({
      qty: line.qty.toNumber(),
      rate: line.rate.toNumber(),
      discount: 0,
      taxRatePercent: line.taxRatePercent.toNumber(),
    })),
    isInterState,
  )

  const number = await nextPurchaseBillNumber()

  const bill = await prisma.purchaseBill.create({
    data: {
      number,
      status: 'DRAFT',
      vendorId: order.vendorId,
      poId: order.id,
      billDate: new Date(`${today}T00:00:00Z`),
      dueDate: new Date(`${defaultDueDate(today, null)}T00:00:00Z`),
      isInterState,
      notes: order.notes,
      ...totals,
      createdById: user.id,
      updatedById: user.id,
      lines: {
        create: order.lines.map((line, index) => ({
          poLineId: line.id,
          itemId: line.itemId,
          materialId: line.materialId,
          description: line.description,
          qty: line.qty,
          unit: line.unit,
          rate: line.rate,
          discount: lines[index].discount,
          taxRatePercent: line.taxRatePercent,
          taxable: lines[index].taxable,
          taxAmount: lines[index].taxAmount,
          lineTotal: lines[index].lineTotal,
        })),
      },
    },
  })

  await logActivity({
    entity: 'purchase-bill',
    id: bill.id,
    action: 'created',
    summary: `created the bill from purchase order ${order.number}`,
    actor: actorOf(user),
  })
  await logActivity({
    entity: 'purchase-order',
    id: order.id,
    action: 'bill',
    summary: `created bill ${bill.number}`,
    actor: actorOf(user),
  })

  revalidatePath('/purchase-bills')
  revalidatePath(`/purchase-orders/${order.id}`)

  return { ok: true, message: `Draft ${bill.number} created`, id: bill.id }
}
