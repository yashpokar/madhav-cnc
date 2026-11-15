// Vendor payment writes, as plain functions that take the acting user's id so
// they can be called without a web session (the server actions are thin
// wrappers that check permissions). Every write and every re-check of "does
// this fit what is outstanding" happens inside one transaction that first
// locks the vendor row, so two payments for the same vendor can never both
// spend the same outstanding amount.

import { prisma } from '@/lib/prisma'
import { guardMoneyChange } from '@/lib/audit-trail/guards'
import { logActivity } from '@/lib/activity'
import { nextVendorPaymentNumber } from '@/lib/codes'
import { detailsColumn, resolvePaymentMode } from '@/lib/payment-modes'
import { parsePaymentDetails } from '@/lib/payment-methods'
import { money } from '@/lib/format'
import {
  planVendorAutoApply,
  round2,
  validateVendorPaymentSplit,
} from '@/lib/payables-math'
import {
  openBillBalances,
  openingPayableFor,
  type Db,
} from '@/lib/queries/vendor-payments'
import type { BillAllocationInput } from '@/lib/validation/vendor-payments'

export type ServiceResult<T = Record<string, never>> =
  | ({ ok: true; message: string } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

/** Thrown inside a transaction to roll it back with a message for the person. */
class Rejected extends Error {}

type Tx = Db & Pick<typeof prisma, '$queryRaw' | 'vendorPayment' | 'vendorPaymentAllocation'>

async function actorFor(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  })

  return user ? { id: user.id, name: user.name } : { id: userId, name: 'Someone' }
}

/** Serialises everything that spends this vendor's outstanding amounts. */
async function lockVendor(tx: Tx, vendorId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM vendors WHERE id = ${vendorId} FOR UPDATE
  `

  if (rows.length === 0) throw new Rejected('Vendor not found')
}

/**
 * Checks a requested split against what is outstanding right now (bills still
 * POSTED, belonging to this vendor, not already paid by others) and returns
 * the rows to store. With nothing chosen, applies the same auto rules as a
 * customer receipt.
 */
async function settle(
  tx: Tx,
  input: {
    vendorId: string
    amount: number
    requested: BillAllocationInput[]
    openingRequested: number
    ignorePaymentId?: string
    autoApply: boolean
  },
) {
  const rows = input.requested
    .map((row) => ({ billId: row.billId, amount: round2(row.amount) }))
    .filter((row) => row.amount > 0)

  if (new Set(rows.map((row) => row.billId)).size !== rows.length) {
    throw new Rejected('A bill appears more than once in the allocation')
  }

  const [open, opening] = await Promise.all([
    openBillBalances(input.vendorId, input.ignorePaymentId, tx),
    openingPayableFor(input.vendorId, input.ignorePaymentId, tx),
  ])
  const byId = new Map(open.map((bill) => [bill.id, bill]))

  for (const row of rows) {
    const bill = byId.get(row.billId)

    if (!bill) {
      throw new Rejected('One of the bills is no longer open for this vendor')
    }

    if (row.amount > bill.due + 0.005) {
      throw new Rejected(`${bill.number} only has ${money.format(bill.due)} outstanding`)
    }
  }

  let openingApplied = round2(Math.max(0, input.openingRequested))
  let finalRows = rows
  const billTotal = round2(rows.reduce((sum, row) => sum + row.amount, 0))

  const checked = validateVendorPaymentSplit({
    payment: input.amount,
    billAllocated: billTotal,
    openingApplied,
    openingLeft: opening.remaining,
  })

  if (!checked.ok) throw new Rejected(checked.error)

  if (input.autoApply && rows.length === 0 && openingApplied === 0) {
    const plan = planVendorAutoApply({
      payment: input.amount,
      explicitBillTotal: 0,
      explicitOpening: 0,
      openBillDues: open.map((bill) => bill.due),
      openingLeft: opening.remaining,
    })

    if (plan.billIndex !== null) {
      finalRows = [{ billId: open[plan.billIndex].id, amount: plan.billAmount }]
    }

    openingApplied = plan.openingAmount
  }

  return { rows: finalRows, openingApplied }
}

async function inTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<ServiceResult<{ value: T }>> {
  try {
    const value = await prisma.$transaction(async (tx) => work(tx as unknown as Tx), {
      timeout: 15_000,
    })

    return { ok: true, message: '', value }
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, error: error.message }

    throw error
  }
}

export async function createVendorPayment(
  userId: string,
  input: {
    vendorId: string
    amount: number
    channelId: string
    /** The method's fixed fields, as posted (JSON text or an object); checked against the chosen method. */
    paymentDetails?: unknown
    paidOn: Date
    notes: string | null
    allocations: BillAllocationInput[]
    openingApplied: number
  },
): Promise<ServiceResult<{ id: string; number: string }>> {
  const amount = round2(input.amount)

  if (!(amount > 0)) return { ok: false, error: 'Amount must be greater than zero' }

  const vendor = await prisma.vendor.findUnique({
    where: { id: input.vendorId },
    select: { id: true },
  })

  if (!vendor) return { ok: false, error: 'Vendor not found' }

  const locked = await guardMoneyChange([input.paidOn])

  if (!locked.ok) return locked

  const method = await resolvePaymentMode(input.channelId)

  if (!method) return { ok: false, error: 'Choose a payment mode' }

  const details = parsePaymentDetails(method.mode, input.paymentDetails, 'out')

  if (!details.ok) return { ok: false, error: details.error, fieldErrors: details.fieldErrors }

  const number = await nextVendorPaymentNumber()

  const outcome = await inTransaction(async (tx) => {
    await lockVendor(tx, input.vendorId)

    const split = await settle(tx, {
      vendorId: input.vendorId,
      amount,
      requested: input.allocations,
      openingRequested: input.openingApplied,
      autoApply: true,
    })

    const payment = await tx.vendorPayment.create({
      data: {
        number,
        vendorId: input.vendorId,
        amount,
        mode: method.mode,
        channelId: method.channelId,
        modeName: method.modeName,
        reference: details.reference,
        paymentDetails: detailsColumn(details.details),
        paidOn: input.paidOn,
        notes: input.notes,
        recordedById: userId,
        openingApplied: split.openingApplied,
        allocations: { create: split.rows },
      },
      select: { id: true, number: true },
    })

    return { payment, rows: split.rows }
  })

  if (!outcome.ok) return outcome

  const { payment, rows } = outcome.value
  const actor = await actorFor(userId)

  await logActivity({
    entity: 'vendor-payment',
    id: payment.id,
    action: 'created',
    summary: 'recorded the payment',
    actor,
  })

  for (const row of rows) {
    await logActivity({
      entity: 'purchase-bill',
      id: row.billId,
      action: 'payment',
      summary: `applied payment ${payment.number} (${money.format(row.amount)})`,
      actor,
    })
  }

  return { ok: true, message: `${payment.number} recorded`, id: payment.id, number: payment.number }
}

export async function updateVendorAllocations(
  userId: string,
  paymentId: string,
  requested: BillAllocationInput[],
  openingApplied = 0,
): Promise<ServiceResult<{ vendorId: string; billIds: string[] }>> {
  const payment = await prisma.vendorPayment.findUnique({
    where: { id: paymentId },
    select: { id: true, number: true, vendorId: true, paidOn: true },
  })

  if (!payment) return { ok: false, error: 'Payment not found' }

  const locked = await guardMoneyChange([payment.paidOn])

  if (!locked.ok) return locked

  const outcome = await inTransaction(async (tx) => {
    await lockVendor(tx, payment.vendorId)

    // The amount is read under the lock so it cannot change underneath us.
    const current = await tx.vendorPayment.findUnique({
      where: { id: paymentId },
      select: { amount: true },
    })

    if (!current) throw new Rejected('Payment not found')

    const split = await settle(tx, {
      vendorId: payment.vendorId,
      amount: current.amount.toNumber(),
      requested,
      openingRequested: openingApplied,
      ignorePaymentId: paymentId,
      autoApply: false,
    })

    await tx.vendorPayment.update({
      where: { id: paymentId },
      data: { openingApplied: split.openingApplied },
    })
    await tx.vendorPaymentAllocation.deleteMany({ where: { vendorPaymentId: paymentId } })

    for (const row of split.rows) {
      await tx.vendorPaymentAllocation.create({
        data: { vendorPaymentId: paymentId, billId: row.billId, amount: row.amount },
      })
    }

    return split.rows
  })

  if (!outcome.ok) return outcome

  const actor = await actorFor(userId)

  await logActivity({
    entity: 'vendor-payment',
    id: paymentId,
    action: 'updated',
    summary: 'changed how the payment is applied',
    actor,
  })

  for (const row of outcome.value) {
    await logActivity({
      entity: 'purchase-bill',
      id: row.billId,
      action: 'payment',
      summary: `applied payment ${payment.number} (${money.format(row.amount)})`,
      actor,
    })
  }

  return {
    ok: true,
    message: `${payment.number} updated`,
    vendorId: payment.vendorId,
    billIds: outcome.value.map((row) => row.billId),
  }
}

/** Removes the payment; its allocations go with it, so the bills' dues are restored. */
export async function deleteVendorPayment(
  userId: string,
  paymentId: string,
): Promise<ServiceResult<{ vendorId: string }>> {
  const payment = await prisma.vendorPayment.findUnique({
    where: { id: paymentId },
    select: {
      number: true,
      vendorId: true,
      paidOn: true,
      allocations: { select: { billId: true } },
    },
  })

  if (!payment) return { ok: false, error: 'Payment not found' }

  const allowed = await guardMoneyChange([payment.paidOn], { destructive: true, what: 'vendor payment' })

  if (!allowed.ok) return allowed

  const outcome = await inTransaction(async (tx) => {
    await lockVendor(tx, payment.vendorId)
    await tx.vendorPayment.delete({ where: { id: paymentId } })
  })

  if (!outcome.ok) return outcome

  const actor = await actorFor(userId)

  for (const row of payment.allocations) {
    await logActivity({
      entity: 'purchase-bill',
      id: row.billId,
      action: 'payment-removed',
      summary: `removed payment ${payment.number}; its amount is due again`,
      actor,
    })
  }

  return { ok: true, message: `${payment.number} deleted`, vendorId: payment.vendorId }
}
