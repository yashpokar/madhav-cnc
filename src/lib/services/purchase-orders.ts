// Purchase order writes as plain functions (moved out of the server actions so
// the mobile API runs the same code). Runs inside a company scope; permission
// checks, cache refresh and redirects stay with the caller.

import { prisma } from '@/lib/prisma'
import { requireCompanyId } from '@/lib/active-company'
import { nextPurchaseBillNumber, nextPurchaseOrderNumber } from '@/lib/codes'
import { logActivity } from '@/lib/activity'
import type { OrderData } from '@/lib/validation/purchases'
import {
  billTotals,
  canEditOrder,
  canMoveOrder,
  defaultDueDate,
  orderLineTotal,
  suggestInterState,
  todayIso,
} from '@/lib/purchase-rules'
import { fail, type Actor, type Failure } from '@/lib/services/people-shared'
import type { PurchaseOrderStatus } from '@/generated/prisma/enums'

async function checkReferences(data: OrderData): Promise<Failure | null> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: data.vendorId },
    select: { id: true },
  })

  if (!vendor) return fail('Vendor not found', 'NOT_FOUND')

  const itemIds = [...new Set(data.lines.flatMap((l) => (l.itemId ? [l.itemId] : [])))]
  const materialIds = [...new Set(data.lines.flatMap((l) => (l.materialId ? [l.materialId] : [])))]

  if (itemIds.length > 0) {
    const found = await prisma.item.count({ where: { id: { in: itemIds } } })

    if (found !== itemIds.length) return fail('An item on a line was not found', 'VALIDATION_FAILED')
  }

  if (materialIds.length > 0) {
    const found = await prisma.material.count({ where: { id: { in: materialIds } } })

    if (found !== materialIds.length) return fail('A material on a line was not found', 'VALIDATION_FAILED')
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

export async function createPurchaseOrder(
  actor: Actor,
  data: OrderData,
): Promise<{ ok: true; id: string } | Failure> {
  const problem = await checkReferences(data)

  if (problem) return problem

  const number = await nextPurchaseOrderNumber()

  const order = await prisma.purchaseOrder.create({
    data: {
      number,
      status: 'DRAFT',
      vendorId: data.vendorId,
      orderDate: data.orderDate,
      expectedDate: data.expectedDate,
      notes: data.notes,
      lines: { create: orderLines(data) },
    },
  })

  await logActivity({
    entity: 'purchase-order',
    id: order.id,
    action: 'created',
    summary: 'created the purchase order',
    actor,
  })

  return { ok: true, id: order.id }
}

export async function updatePurchaseOrder(
  actor: Actor,
  id: string,
  data: OrderData,
): Promise<{ ok: true; id: string } | Failure> {
  const existing = await prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true } })

  if (!existing) return fail('Purchase order not found', 'NOT_FOUND')

  if (!canEditOrder(existing.status)) {
    return fail('This purchase order can no longer be edited.')
  }

  const problem = await checkReferences(data)

  if (problem) return problem

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderLine.deleteMany({ where: { poId: id } })
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        vendorId: data.vendorId,
        orderDate: data.orderDate,
        expectedDate: data.expectedDate,
        notes: data.notes,
        lines: { create: orderLines(data) },
      },
    })
  })

  await logActivity({
    entity: 'purchase-order',
    id,
    action: 'updated',
    summary: 'edited the purchase order',
    actor,
  })

  return { ok: true, id }
}

const SUMMARY: Partial<Record<PurchaseOrderStatus, string>> = {
  SENT: 'marked the purchase order as sent',
  CANCELLED: 'cancelled the purchase order',
  DRAFT: 'moved the purchase order back to draft',
}

export async function setPurchaseOrderStatus(
  actor: Actor,
  id: string,
  status: PurchaseOrderStatus,
): Promise<{ ok: true; message: string } | Failure> {
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { status: true, number: true },
  })

  if (!existing) return fail('Purchase order not found', 'NOT_FOUND')

  if (existing.status === status) {
    return { ok: true, message: `${existing.number} is already ${status.toLowerCase()}` }
  }

  const move = canMoveOrder(existing.status, status)

  if (!move.ok) return fail(move.reason)

  // Conditional on the status we read, so a double click changes it once.
  const claimed = await prisma.purchaseOrder.updateMany({
    where: { id, status: existing.status },
    data: { status },
  })

  if (claimed.count === 0) {
    return fail('This order was changed by someone else. Refresh and try again.')
  }

  await logActivity({
    entity: 'purchase-order',
    id,
    action: 'status',
    summary: SUMMARY[status] ?? `marked the purchase order ${status.toLowerCase()}`,
    actor,
  })

  return { ok: true, message: `${existing.number} marked ${status.toLowerCase()}` }
}

export async function deletePurchaseOrder(id: string): Promise<{ ok: true; message: string } | Failure> {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      number: true,
      status: true,
      _count: { select: { bills: true, receipts: true } },
    },
  })

  if (!order) return fail('Purchase order not found', 'NOT_FOUND')

  if (order.status !== 'DRAFT' && order.status !== 'CANCELLED') {
    return fail('Cancel this purchase order before deleting it')
  }

  if (order._count.bills > 0 || order._count.receipts > 0) {
    return fail('Bills or receipts refer to this purchase order.')
  }

  await prisma.purchaseOrder.delete({ where: { id } })

  return { ok: true, message: `${order.number} deleted` }
}

/** Copies an order's lines into a new draft bill linked back to the order. */
export async function createBillFromOrder(
  actor: Actor,
  id: string,
): Promise<{ ok: true; message: string; id: string; orderId: string } | Failure> {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: { select: { gstin: true } },
      lines: { orderBy: { sortOrder: 'asc' } },
    },
  })

  if (!order) return fail('Purchase order not found', 'NOT_FOUND')

  if (order.status === 'CANCELLED') return fail('A cancelled purchase order cannot be billed')

  if (order.lines.length === 0) return fail('This purchase order has no lines')

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
      createdById: actor.id,
      updatedById: actor.id,
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
    actor,
  })
  await logActivity({
    entity: 'purchase-order',
    id: order.id,
    action: 'bill',
    summary: `created bill ${bill.number}`,
    actor,
  })

  return { ok: true, message: `Draft ${bill.number} created`, id: bill.id, orderId: order.id }
}
