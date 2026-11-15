// Customer receipts (payments in), as plain functions that take the acting
// user (no session, cookies, redirect or revalidatePath), so the server
// actions and the mobile API run the very same code.
//
// Runs inside a company scope (web: active-company cookie; API: X-Company-Id):
// every lookup and insert is filtered/stamped by the scope layer, so no
// companyId is accepted from callers and another company's customer, invoice
// or payment mode simply is "not found".
//
// Permissions are checked by the caller (web requireCapability / API
// capability); the ownership and state rules (order advances, what is still
// open, opening balance) are re-checked here.

import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { nextPaymentNumber } from '@/lib/codes'
import { detailsColumn, resolvePaymentMode } from '@/lib/payment-modes'
import { parsePaymentDetails } from '@/lib/payment-methods'
import { round2 } from '@/lib/pricing'
import { planAutoApply, validateOpeningApplied } from '@/lib/receivables-math'
import { openInvoiceBalances, openingBalanceFor } from '@/lib/queries/payments'
import type { AllocationInput, ReceiptInput } from '@/lib/validation/payments'
import { activityActor, type Actor, type ServiceResult } from '@/lib/services/money-shared'

export type { Actor, ServiceResult, ReceiptInput, AllocationInput }

type Checked<T> = ({ ok: true } & T) | { ok: false; error: string }

/**
 * Pure rule: a requested split against the receipt total and the invoices'
 * outstanding amounts. Zero rows are dropped.
 */
export function checkAllocationRows(
  receiptTotal: number,
  requested: AllocationInput[],
  open: { id: string; number: string; due: number }[],
): Checked<{ rows: AllocationInput[] }> {
  const rows = requested.filter((row) => row.amount > 0)
  const allocated = round2(rows.reduce((sum, row) => sum + row.amount, 0))

  if (allocated > receiptTotal + 0.005) {
    return {
      ok: false,
      error: `You have applied ₹${allocated} of a ₹${receiptTotal} receipt`,
    }
  }

  if (rows.length === 0) return { ok: true, rows }

  const byId = new Map(open.map((row) => [row.id, row]))

  for (const row of rows) {
    const invoice = byId.get(row.invoiceId)

    if (!invoice) {
      return { ok: false, error: 'One of the invoices is no longer open for this customer' }
    }

    if (row.amount > invoice.due + 0.005) {
      return { ok: false, error: `${invoice.number} only has ₹${invoice.due} outstanding` }
    }
  }

  return { ok: true, rows }
}

/** The opening portion must fit what is left of the opening balance and the receipt. */
async function validateOpening(
  customerId: string,
  receiptTotal: number,
  invoiceAllocated: number,
  openingApplied: number,
  ignorePaymentId?: string,
): Promise<Checked<{ amount: number }>> {
  const amount = round2(openingApplied)

  if (amount <= 0) return { ok: true, amount: 0 }

  const opening = await openingBalanceFor(customerId, ignorePaymentId)
  const checked = validateOpeningApplied({
    receipt: receiptTotal,
    invoiceAllocated,
    openingApplied: amount,
    openingLeft: opening.remaining,
  })

  return checked.ok ? { ok: true, amount } : checked
}

async function validateAllocations(
  customerId: string,
  receiptTotal: number,
  requested: AllocationInput[],
  ignorePaymentId?: string,
): Promise<Checked<{ rows: AllocationInput[] }>> {
  const rows = requested.filter((row) => row.amount > 0)

  // The balances are only read when there is something to check them against.
  const balances =
    rows.length > 0 ? await openInvoiceBalances(customerId, ignorePaymentId) : []

  return checkAllocationRows(receiptTotal, requested, balances)
}

export async function createReceipt(
  actor: Actor,
  input: ReceiptInput,
): Promise<ServiceResult<{ id: string; number: string; customerId: string; invoiceIds: string[] }>> {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true },
  })

  if (!customer) return { ok: false, error: 'Customer not found' }

  const checked = await validateAllocations(input.customerId, input.amount, input.allocations)

  if (!checked.ok) return { ok: false, error: checked.error }

  const invoiceAllocated = round2(checked.rows.reduce((sum, row) => sum + row.amount, 0))
  const openingChecked = await validateOpening(
    input.customerId,
    input.amount,
    invoiceAllocated,
    input.openingApplied,
  )

  if (!openingChecked.ok) return { ok: false, error: openingChecked.error }

  // With nothing chosen and exactly one thing it could belong to (a single
  // open invoice, or only an opening balance) there is nothing to decide.
  // Several open items still need a choice, and an explicit choice (including
  // the opening balance) is never overridden.
  let allocationRows = checked.rows
  let openingApplied = openingChecked.amount

  if (allocationRows.length === 0 && openingApplied === 0) {
    const open = (await openInvoiceBalances(input.customerId)).filter((row) => row.due > 0)
    const opening = await openingBalanceFor(input.customerId)
    const plan = planAutoApply({
      receipt: input.amount,
      explicitInvoiceTotal: 0,
      explicitOpening: 0,
      openInvoiceDues: open.map((row) => row.due),
      openingLeft: opening.remaining,
    })

    if (plan.invoiceIndex !== null) {
      allocationRows = [{ invoiceId: open[plan.invoiceIndex].id, amount: plan.invoiceAmount }]
    }

    openingApplied = plan.openingAmount
  }

  const method = await resolvePaymentMode(input.channelId)

  if (!method) {
    return {
      ok: false,
      error: 'Choose a payment mode',
      fieldErrors: { channelId: 'Choose a payment mode' },
    }
  }

  const details = parsePaymentDetails(method.mode, input.paymentDetails, 'in')

  if (!details.ok) {
    return { ok: false, error: details.error, fieldErrors: details.fieldErrors }
  }

  // The number is taken just before the insert (a single statement per
  // company); a failed insert can leave a gap, never a duplicate.
  const number = await nextPaymentNumber()

  const payment = await prisma.payment.create({
    data: {
      number,
      customerId: input.customerId,
      amount: input.amount,
      mode: method.mode,
      channelId: method.channelId,
      modeName: method.modeName,
      reference: details.reference,
      paymentDetails: detailsColumn(details.details),
      paidOn: input.paidOn,
      notes: input.notes,
      recordedById: actor.userId,
      openingApplied,
      allocations: { create: allocationRows },
    },
  })

  await logActivity({
    entity: 'payment',
    id: payment.id,
    action: 'created',
    summary: 'recorded the receipt',
    actor: await activityActor(actor),
  })

  return {
    ok: true,
    message: `${payment.number} recorded`,
    id: payment.id,
    number: payment.number,
    customerId: input.customerId,
    invoiceIds: allocationRows.map((row) => row.invoiceId),
  }
}

export async function updateReceiptAllocations(
  actor: Actor,
  paymentId: string,
  requested: AllocationInput[],
  openingApplied = 0,
): Promise<ServiceResult<{ customerId: string; invoiceIds: string[] }>> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, number: true, customerId: true, amount: true, orderId: true },
  })

  if (!payment) return { ok: false, error: 'Receipt not found' }

  if (payment.orderId) {
    return {
      ok: false,
      error: 'This is the advance on an order. It is deducted on the invoice automatically; change it on the order.',
    }
  }

  const checked = await validateAllocations(
    payment.customerId,
    payment.amount.toNumber(),
    requested,
    paymentId,
  )

  if (!checked.ok) return { ok: false, error: checked.error }

  const openingChecked = await validateOpening(
    payment.customerId,
    payment.amount.toNumber(),
    round2(checked.rows.reduce((sum, row) => sum + row.amount, 0)),
    openingApplied,
    paymentId,
  )

  if (!openingChecked.ok) return { ok: false, error: openingChecked.error }

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: paymentId },
      data: { openingApplied: openingChecked.amount },
    }),
    prisma.paymentAllocation.deleteMany({ where: { paymentId } }),
    ...checked.rows.map((row) =>
      prisma.paymentAllocation.create({
        data: { paymentId, invoiceId: row.invoiceId, amount: row.amount },
      }),
    ),
  ])

  const who = await activityActor(actor)

  await logActivity({
    entity: 'payment',
    id: paymentId,
    action: 'updated',
    summary: 'changed how the receipt is applied',
    actor: who,
  })

  for (const row of checked.rows) {
    await logActivity({
      entity: 'invoice',
      id: row.invoiceId,
      action: 'payment',
      summary: `applied receipt ${payment.number} (₹${new Intl.NumberFormat('en-IN').format(row.amount)})`,
      actor: who,
    })
  }

  return {
    ok: true,
    message: `${payment.number} updated`,
    customerId: payment.customerId,
    invoiceIds: checked.rows.map((row) => row.invoiceId),
  }
}

export async function deleteReceipt(
  _actor: Actor,
  paymentId: string,
): Promise<ServiceResult> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { number: true, orderId: true },
  })

  if (!payment) return { ok: false, error: 'Receipt not found' }

  if (payment.orderId) {
    return {
      ok: false,
      error: 'This is the advance on an order. Set the advance to 0 on the order to remove it.',
    }
  }

  await prisma.payment.delete({ where: { id: paymentId } })

  return { ok: true, message: `${payment.number} deleted` }
}

/** What the receipt form needs when a customer is picked. */
export async function openItemsForCustomer(customerId: string) {
  const [invoices, opening] = await Promise.all([
    openInvoiceBalances(customerId),
    openingBalanceFor(customerId),
  ])

  return { invoices, openingLeft: opening.remaining }
}
