'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { nextPurchaseBillNumber } from '@/lib/codes'
import { logActivity } from '@/lib/activity'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import { billInputSchema, type BillData } from '@/lib/validation/purchases'
import { requireCompanyId } from '@/lib/active-company'
import { buildBill, canMoveBill, suggestInterState } from '@/lib/purchase-rules'
import {
  onBillCancelled,
  onBillPosted,
  PurchaseHookError,
  type HookBill,
} from '@/lib/purchase-hooks'
import type { PurchaseBillStatus } from '@/generated/prisma/enums'

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

  return billInputSchema.safeParse({
    vendorId: formData.get('vendorId'),
    poId: formData.get('poId'),
    vendorBillNumber: formData.get('vendorBillNumber'),
    billDate: formData.get('billDate'),
    dueDate: formData.get('dueDate'),
    isInterState: formData.get('isInterState') === 'true',
    notes: formData.get('notes'),
    lines,
  })
}

/**
 * Every id the client sent must exist in the active company (the scope layer
 * hides other companies' rows, so "not found" covers both). Returns a friendly
 * message for the first problem, or null.
 */
async function checkReferences(data: BillData): Promise<string | null> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: data.vendorId },
    select: { id: true },
  })

  if (!vendor) return 'Vendor not found'

  if (data.poId) {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: data.poId },
      select: { vendorId: true },
    })

    if (!po) return 'Purchase order not found'
    if (po.vendorId !== data.vendorId) {
      return 'That purchase order belongs to a different vendor'
    }
  }

  const itemIds = [...new Set(data.lines.flatMap((l) => (l.itemId ? [l.itemId] : [])))]
  const materialIds = [
    ...new Set(data.lines.flatMap((l) => (l.materialId ? [l.materialId] : []))),
  ]
  const poLineIds = [
    ...new Set(data.lines.flatMap((l) => (l.poLineId ? [l.poLineId] : []))),
  ]

  if (itemIds.length > 0) {
    const found = await prisma.item.count({ where: { id: { in: itemIds } } })
    if (found !== itemIds.length) return 'An item on a line was not found'
  }

  if (materialIds.length > 0) {
    const found = await prisma.material.count({ where: { id: { in: materialIds } } })
    if (found !== materialIds.length) return 'A material on a line was not found'
  }

  if (poLineIds.length > 0) {
    const found = await prisma.purchaseOrderLine.count({
      where: { id: { in: poLineIds }, ...(data.poId ? { poId: data.poId } : {}) },
    })
    if (!data.poId || found !== poLineIds.length) {
      return 'A purchase order line was not found'
    }
  }

  return null
}

export async function createBill(
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

  const { totals, lines } = buildBill(parsed.data)
  const number = await nextPurchaseBillNumber()

  const bill = await prisma.purchaseBill.create({
    data: {
      number,
      status: 'DRAFT',
      vendorId: parsed.data.vendorId,
      poId: parsed.data.poId,
      vendorBillNumber: parsed.data.vendorBillNumber,
      billDate: parsed.data.billDate,
      dueDate: parsed.data.dueDate,
      isInterState: parsed.data.isInterState,
      notes: parsed.data.notes,
      ...totals,
      createdById: user.id,
      updatedById: user.id,
      lines: { create: lines },
    },
  })

  await logActivity({
    entity: 'purchase-bill',
    id: bill.id,
    action: 'created',
    summary: 'created the bill',
    actor: actorOf(user),
  })

  revalidatePath('/purchase-bills')
  redirect(`/purchase-bills/${bill.id}?created=1`)
}

export async function updateBill(
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

  const existing = await prisma.purchaseBill.findUnique({
    where: { id },
    select: { status: true },
  })

  if (!existing) return { status: 'error', message: 'Bill not found' }

  if (existing.status !== 'DRAFT') {
    return {
      status: 'error',
      message: 'A posted bill is locked. Move it back to draft to edit it.',
    }
  }

  const problem = await checkReferences(parsed.data)

  if (problem) return { status: 'error', message: problem }

  const { totals, lines } = buildBill(parsed.data)

  try {
    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction so a post that raced this save wins.
      const claimed = await tx.purchaseBill.updateMany({
        where: { id, status: 'DRAFT' },
        data: { updatedById: user.id },
      })

      if (claimed.count === 0) throw new Error('LOCKED')

      await tx.purchaseBillLine.deleteMany({ where: { billId: id } })
      await tx.purchaseBill.update({
        where: { id },
        data: {
          vendorId: parsed.data.vendorId,
          poId: parsed.data.poId,
          vendorBillNumber: parsed.data.vendorBillNumber,
          billDate: parsed.data.billDate,
          dueDate: parsed.data.dueDate,
          isInterState: parsed.data.isInterState,
          notes: parsed.data.notes,
          ...totals,
          updatedById: user.id,
          lines: { create: lines },
        },
      })
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'LOCKED') {
      return {
        status: 'error',
        message: 'A posted bill is locked. Move it back to draft to edit it.',
      }
    }

    throw error
  }

  await logActivity({
    entity: 'purchase-bill',
    id,
    action: 'updated',
    summary: 'edited the bill',
    actor: actorOf(user),
  })

  revalidatePath('/purchase-bills')
  revalidatePath(`/purchase-bills/${id}`)

  return { status: 'success', message: 'Bill saved', id }
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
 * the status the bill already has is a harmless no-op.
 */
export async function setBillStatus(
  id: string,
  status: PurchaseBillStatus,
  options: { receiveNow?: boolean } = {},
): Promise<SimpleResult> {
  const user = await requireCapability('purchase:update')

  type Outcome =
    | { kind: 'error'; error: string }
    | { kind: 'same'; number: string }
    | { kind: 'done'; number: string }

  if (options.receiveNow && status === 'POSTED') {
    // Receiving goods is a stock job: posting alone needs only purchase rights.
    await requireCapability('stock:create')
  }

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

      if (!current) return { kind: 'error', error: 'Bill not found' } as const

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
        data: { status, updatedById: user.id },
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
            userId: user.id,
            receiveNow: options.receiveNow === true,
          })
        } else if (current.status === 'POSTED') {
          await onBillCancelled(tx, bill, status === 'DRAFT' ? 'unposted' : 'cancelled')
        }
      }

      return { kind: 'done', number: current.number } as const
    })
  } catch (error) {
    if (error instanceof PurchaseHookError) return { ok: false, error: error.message }

    throw error
  }

  if (outcome.kind === 'error') return { ok: false, error: outcome.error }

  if (outcome.kind === 'same') {
    return { ok: true, message: `${outcome.number} is already ${status.toLowerCase()}` }
  }

  await logActivity({
    entity: 'purchase-bill',
    id,
    action: 'status',
    summary: SUMMARY[status],
    actor: actorOf(user),
  })

  revalidatePath('/purchase-bills')
  revalidatePath(`/purchase-bills/${id}`)

  return {
    ok: true,
    message:
      options.receiveNow && status === 'POSTED'
        ? `${outcome.number} posted and goods received`
        : `${outcome.number} marked ${status.toLowerCase()}`,
  }
}

export async function duplicateBill(id: string): Promise<SimpleResult> {
  const user = await requireCapability('purchase:create')

  const source = await prisma.purchaseBill.findUnique({
    where: { id },
    include: { lines: { orderBy: { id: 'asc' } } },
  })

  if (!source) return { ok: false, error: 'Bill not found' }

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
      createdById: user.id,
      updatedById: user.id,
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
    actor: actorOf(user),
  })
  await logActivity({
    entity: 'purchase-bill',
    id: source.id,
    action: 'duplicated',
    summary: `duplicated into ${created.number}`,
    actor: actorOf(user),
  })

  revalidatePath('/purchase-bills')

  return {
    ok: true,
    message: `${created.number} created as a copy of ${source.number}`,
    id: created.id,
  }
}

export async function deleteBill(id: string): Promise<SimpleResult> {
  await requireCapability('purchase:delete')

  const bill = await prisma.purchaseBill.findUnique({
    where: { id },
    select: {
      number: true,
      status: true,
      _count: { select: { allocations: true, receipts: true } },
    },
  })

  if (!bill) return { ok: false, error: 'Bill not found' }

  if (bill.status === 'POSTED') {
    return { ok: false, error: 'Cancel a posted bill before deleting it' }
  }

  if (bill._count.allocations > 0) {
    return { ok: false, error: 'Payments are applied to this bill. Remove them first.' }
  }

  if (bill._count.receipts > 0) {
    return { ok: false, error: 'Goods have been received against this bill.' }
  }

  await prisma.purchaseBill.delete({ where: { id } })

  revalidatePath('/purchase-bills')

  return { ok: true, message: `${bill.number} deleted` }
}

/** The vendor chosen (or just added) in the picker, with what the form needs. */
export async function resolveVendor(name: string) {
  await requireCapability('purchase:read')

  const vendor = await prisma.vendor.findFirst({
    where: { name: { equals: name.trim(), mode: 'insensitive' } },
    select: { id: true, name: true, gstin: true },
  })

  return vendor
}

/** Whether buying from this vendor is inter-state, from the two GSTINs. */
export async function suggestBillInterState(vendorGstin: string | null) {
  await requireCapability('purchase:read')

  const company = await prisma.companySetting.findUnique({
    where: { id: await requireCompanyId() },
    select: { gstin: true },
  })

  return suggestInterState(company?.gstin ?? null, vendorGstin)
}
