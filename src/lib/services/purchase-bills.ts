// Purchase bill writes as plain functions (moved out of the server actions so
// the mobile API runs the same code). Runs inside a company scope; permission
// checks, cache refresh and redirects stay with the caller.

import { prisma } from '@/lib/prisma'
import { nextPurchaseBillNumber } from '@/lib/codes'
import { logActivity } from '@/lib/activity'
import type { BillData } from '@/lib/validation/purchases'
import { buildBill, canMoveBill } from '@/lib/purchase-rules'
import { onBillCancelled, onBillPosted, PurchaseHookError, type HookBill } from '@/lib/purchase-hooks'
import { fail, type Actor, type Failure } from '@/lib/services/people-shared'
import type { PurchaseBillStatus } from '@/generated/prisma/enums'

const LOCKED = 'A posted bill is locked. Move it back to draft to edit it.'

/**
 * Every id the client sent must exist in the active company (the scope layer
 * hides other companies' rows, so "not found" covers both).
 */
async function checkReferences(data: BillData): Promise<Failure | null> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: data.vendorId },
    select: { id: true },
  })

  if (!vendor) return fail('Vendor not found', 'NOT_FOUND')

  if (data.poId) {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: data.poId },
      select: { vendorId: true },
    })

    if (!po) return fail('Purchase order not found', 'NOT_FOUND')

    if (po.vendorId !== data.vendorId) {
      return fail('That purchase order belongs to a different vendor', 'VALIDATION_FAILED')
    }
  }

  const itemIds = [...new Set(data.lines.flatMap((l) => (l.itemId ? [l.itemId] : [])))]
  const materialIds = [...new Set(data.lines.flatMap((l) => (l.materialId ? [l.materialId] : [])))]
  const poLineIds = [...new Set(data.lines.flatMap((l) => (l.poLineId ? [l.poLineId] : [])))]

  if (itemIds.length > 0) {
    const found = await prisma.item.count({ where: { id: { in: itemIds } } })

    if (found !== itemIds.length) return fail('An item on a line was not found', 'VALIDATION_FAILED')
  }

  if (materialIds.length > 0) {
    const found = await prisma.material.count({ where: { id: { in: materialIds } } })

    if (found !== materialIds.length) return fail('A material on a line was not found', 'VALIDATION_FAILED')
  }

  if (poLineIds.length > 0) {
    const found = await prisma.purchaseOrderLine.count({
      where: { id: { in: poLineIds }, ...(data.poId ? { poId: data.poId } : {}) },
    })

    if (!data.poId || found !== poLineIds.length) {
      return fail('A purchase order line was not found', 'VALIDATION_FAILED')
    }
  }

  return null
}

export async function createPurchaseBill(
  actor: Actor,
  data: BillData,
): Promise<{ ok: true; id: string } | Failure> {
  const problem = await checkReferences(data)

  if (problem) return problem

  const { totals, lines } = buildBill(data)
  const number = await nextPurchaseBillNumber()

  const bill = await prisma.purchaseBill.create({
    data: {
      number,
      status: 'DRAFT',
      vendorId: data.vendorId,
      poId: data.poId,
      vendorBillNumber: data.vendorBillNumber,
      billDate: data.billDate,
      dueDate: data.dueDate,
      isInterState: data.isInterState,
      notes: data.notes,
      ...totals,
      createdById: actor.id,
      updatedById: actor.id,
      lines: { create: lines },
    },
  })

  await logActivity({
    entity: 'purchase-bill',
    id: bill.id,
    action: 'created',
    summary: 'created the bill',
    actor,
  })

  return { ok: true, id: bill.id }
}

export async function updatePurchaseBill(
  actor: Actor,
  id: string,
  data: BillData,
): Promise<{ ok: true; id: string } | Failure> {
  const existing = await prisma.purchaseBill.findUnique({ where: { id }, select: { status: true } })

  if (!existing) return fail('Bill not found', 'NOT_FOUND')

  if (existing.status !== 'DRAFT') return fail(LOCKED)

  const problem = await checkReferences(data)

  if (problem) return problem

  const { totals, lines } = buildBill(data)

  try {
    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction so a post that raced this save wins.
      const claimed = await tx.purchaseBill.updateMany({
        where: { id, status: 'DRAFT' },
        data: { updatedById: actor.id },
      })

      if (claimed.count === 0) throw new Error('LOCKED')

      await tx.purchaseBillLine.deleteMany({ where: { billId: id } })
      await tx.purchaseBill.update({
        where: { id },
        data: {
          vendorId: data.vendorId,
          poId: data.poId,
          vendorBillNumber: data.vendorBillNumber,
          billDate: data.billDate,
          dueDate: data.dueDate,
          isInterState: data.isInterState,
          notes: data.notes,
          ...totals,
          updatedById: actor.id,
          lines: { create: lines },
        },
      })
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'LOCKED') return fail(LOCKED)

    throw error
  }

  await logActivity({
    entity: 'purchase-bill',
    id,
    action: 'updated',
    summary: 'edited the bill',
    actor,
  })

  return { ok: true, id }
}

async function hookBill(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  id: string,
): Promise<HookBill | null> {
  const bill = await tx.purchaseBill.findUnique({
    where: { id },
    include: { lines: { orderBy: { id: 'asc' } } },
  })

  if (!bill) return null

  return {
    id: bill.id,
    number: bill.number,
    vendorId: bill.vendorId,
    poId: bill.poId,
    billDate: bill.billDate,
    lines: bill.lines.map((line) => ({
      id: line.id,
      itemId: line.itemId,
      materialId: line.materialId,
      description: line.description,
      qty: line.qty.toNumber(),
      unit: line.unit,
      rate: line.rate.toNumber(),
    })),
  }
}

const SUMMARY: Record<PurchaseBillStatus, string> = {
  POSTED: 'posted the bill',
  CANCELLED: 'cancelled the bill',
  DRAFT: 'moved the bill back to draft',
}

/**
 * Moves a bill between draft, posted and cancelled inside one transaction.
 * The status is claimed with a conditional update (where status = what we
 * read), so two clicks at once cannot both run the side effects; asking for
 * the status the bill already has is a harmless no-op. The caller checks that
 * receiving goods (`receiveNow`) is allowed (stock:create).
 */
export async function setPurchaseBillStatus(
  actor: Actor,
  id: string,
  status: PurchaseBillStatus,
  options: { receiveNow?: boolean } = {},
): Promise<{ ok: true; message: string } | Failure> {
  type Outcome =
    | { kind: 'error'; error: string; code?: Failure['code'] }
    | { kind: 'same'; number: string }
    | { kind: 'done'; number: string }

  let outcome: Outcome

  try {
    outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
      const current = await tx.purchaseBill.findUnique({
        where: { id },
        select: {
          number: true,
          status: true,
          _count: { select: { allocations: true, lines: true } },
        },
      })

      if (!current) return { kind: 'error', error: 'Bill not found', code: 'NOT_FOUND' } as const

      if (current.status === status) {
        return { kind: 'same', number: current.number } as const
      }

      const move = canMoveBill(current.status, status, current._count.allocations)

      if (!move.ok) return { kind: 'error', error: move.reason } as const

      if (status === 'POSTED' && current._count.lines === 0) {
        return { kind: 'error', error: 'Add at least one line before posting' } as const
      }

      const claimed = await tx.purchaseBill.updateMany({
        where: { id, status: current.status },
        data: { status, updatedById: actor.id },
      })

      if (claimed.count === 0) {
        return {
          kind: 'error',
          error: 'This bill was changed by someone else. Refresh and try again.',
        } as const
      }

      const bill = await hookBill(tx, id)

      if (bill) {
        if (status === 'POSTED') {
          await onBillPosted(tx, bill, {
            userId: actor.id,
            receiveNow: options.receiveNow === true,
          })
        } else if (current.status === 'POSTED') {
          await onBillCancelled(tx, bill, status === 'DRAFT' ? 'unposted' : 'cancelled')
        }
      }

      return { kind: 'done', number: current.number } as const
    })
  } catch (error) {
    if (error instanceof PurchaseHookError) return fail(error.message)

    throw error
  }

  if (outcome.kind === 'error') return fail(outcome.error, outcome.code ?? 'CONFLICT')

  if (outcome.kind === 'same') {
    return { ok: true, message: `${outcome.number} is already ${status.toLowerCase()}` }
  }

  await logActivity({
    entity: 'purchase-bill',
    id,
    action: 'status',
    summary: SUMMARY[status],
    actor,
  })

  return {
    ok: true,
    message:
      options.receiveNow && status === 'POSTED'
        ? `${outcome.number} posted and goods received`
        : `${outcome.number} marked ${status.toLowerCase()}`,
  }
}

export async function duplicatePurchaseBill(
  actor: Actor,
  id: string,
): Promise<{ ok: true; message: string; id: string } | Failure> {
  const source = await prisma.purchaseBill.findUnique({
    where: { id },
    include: { lines: { orderBy: { id: 'asc' } } },
  })

  if (!source) return fail('Bill not found', 'NOT_FOUND')

  const number = await nextPurchaseBillNumber()

  const created = await prisma.purchaseBill.create({
    data: {
      number,
      status: 'DRAFT',
      vendorId: source.vendorId,
      // A copy is a fresh bill: not tied to the order or the vendor's number.
      poId: null,
      vendorBillNumber: null,
      billDate: new Date(),
      dueDate: null,
      isInterState: source.isInterState,
      subtotal: source.subtotal,
      discount: source.discount,
      taxableAmount: source.taxableAmount,
      cgst: source.cgst,
      sgst: source.sgst,
      igst: source.igst,
      taxAmount: source.taxAmount,
      roundOff: source.roundOff,
      total: source.total,
      notes: source.notes,
      createdById: actor.id,
      updatedById: actor.id,
      lines: {
        create: source.lines.map((line) => ({
          itemId: line.itemId,
          materialId: line.materialId,
          description: line.description,
          hsnCode: line.hsnCode,
          qty: line.qty,
          unit: line.unit,
          rate: line.rate,
          discount: line.discount,
          taxRatePercent: line.taxRatePercent,
          taxable: line.taxable,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
        })),
      },
    },
  })

  await logActivity({
    entity: 'purchase-bill',
    id: created.id,
    action: 'created',
    summary: `duplicated this bill from ${source.number}`,
    actor,
  })
  await logActivity({
    entity: 'purchase-bill',
    id: source.id,
    action: 'duplicated',
    summary: `duplicated into ${created.number}`,
    actor,
  })

  return {
    ok: true,
    message: `${created.number} created as a copy of ${source.number}`,
    id: created.id,
  }
}

export async function deletePurchaseBill(id: string): Promise<{ ok: true; message: string } | Failure> {
  const bill = await prisma.purchaseBill.findUnique({
    where: { id },
    select: {
      number: true,
      status: true,
      _count: { select: { allocations: true, receipts: true } },
    },
  })

  if (!bill) return fail('Bill not found', 'NOT_FOUND')

  if (bill.status === 'POSTED') return fail('Cancel a posted bill before deleting it')

  if (bill._count.allocations > 0) return fail('Payments are applied to this bill. Remove them first.')

  if (bill._count.receipts > 0) return fail('Goods have been received against this bill.')

  await prisma.purchaseBill.delete({ where: { id } })

  return { ok: true, message: `${bill.number} deleted` }
}
