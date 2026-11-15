'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { detailsColumn, resolvePaymentMode } from '@/lib/payment-modes'
import { parsePaymentDetails } from '@/lib/payment-methods'
import { logActivity } from '@/lib/activity'
import { requireCapability } from '@/lib/session'
import { nextPaymentNumber } from '@/lib/codes'
import { round2 } from '@/lib/pricing'
import { receiptInputSchema } from '@/lib/validation/payments'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import { openInvoiceBalances, openingBalanceFor } from '@/lib/queries/payments'
import { planAutoApply, validateOpeningApplied } from '@/lib/receivables-math'

export type { FormState, SimpleResult }

function parse(formData: FormData) {
  let allocations: unknown = []

  try {
    allocations = JSON.parse(String(formData.get('allocations') ?? '[]'))
  } catch {
    allocations = []
  }

  return receiptInputSchema.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount') || 0,
    channelId: formData.get('channelId'),
    paidOn: formData.get('paidOn'),
    notes: formData.get('notes'),
    allocations,
    openingApplied: formData.get('openingApplied') || 0,
  })
}

/** The opening portion must fit what is left of the opening balance and the receipt. */
async function validateOpening(
  customerId: string,
  receiptTotal: number,
  invoiceAllocated: number,
  openingApplied: number,
  ignorePaymentId?: string,
): Promise<{ ok: true; amount: number } | { ok: false; error: string }> {
  const amount = round2(openingApplied)

  if (amount <= 0) {
    return { ok: true, amount: 0 }
  }

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
  requested: { invoiceId: string; amount: number }[],
  ignorePaymentId?: string,
): Promise<{ ok: true; rows: { invoiceId: string; amount: number }[] } | { ok: false; error: string }> {
  const rows = requested.filter((row) => row.amount > 0)
  const allocated = round2(rows.reduce((sum, row) => sum + row.amount, 0))

  if (allocated > receiptTotal + 0.005) {
    return {
      ok: false,
      error: `You have applied ₹${allocated} of a ₹${receiptTotal} receipt`,
    }
  }

  if (rows.length === 0) {
    return { ok: true, rows }
  }

  const balances = await openInvoiceBalances(customerId, ignorePaymentId)
  const byId = new Map(balances.map((row) => [row.id, row]))

  for (const row of rows) {
    const invoice = byId.get(row.invoiceId)

    if (!invoice) {
      return {
        ok: false,
        error: 'One of the invoices is no longer open for this customer',
      }
    }

    if (row.amount > invoice.due + 0.005) {
      return {
        ok: false,
        error: `${invoice.number} only has ₹${invoice.due} outstanding`,
      }
    }
  }

  return { ok: true, rows }
}

export async function createReceipt(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('payment:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const customer = await prisma.customer.findUnique({
    where: { id: parsed.data.customerId },
    select: { id: true },
  })

  if (!customer) {
    return { status: 'error', message: 'Customer not found' }
  }

  const checked = await validateAllocations(
    parsed.data.customerId,
    parsed.data.amount,
    parsed.data.allocations,
  )

  if (!checked.ok) {
    return {
      status: 'error',
      message: checked.error,
      values: rawValues(formData),
    }
  }

  const invoiceAllocated = round2(
    checked.rows.reduce((sum, row) => sum + row.amount, 0),
  )
  const openingChecked = await validateOpening(
    parsed.data.customerId,
    parsed.data.amount,
    invoiceAllocated,
    parsed.data.openingApplied,
  )

  if (!openingChecked.ok) {
    return {
      status: 'error',
      message: openingChecked.error,
      values: rawValues(formData),
    }
  }

  // With nothing chosen and exactly one thing it could belong to (a single
  // open invoice, or only an opening balance) there is nothing to decide.
  // Several open items still need a choice, and an explicit choice (including
  // the opening balance) is never overridden.
  let allocationRows = checked.rows
  let openingApplied = openingChecked.amount

  if (allocationRows.length === 0 && openingApplied === 0) {
    const open = (await openInvoiceBalances(parsed.data.customerId)).filter(
      (row) => row.due > 0,
    )
    const opening = await openingBalanceFor(parsed.data.customerId)
    const plan = planAutoApply({
      receipt: parsed.data.amount,
      explicitInvoiceTotal: 0,
      explicitOpening: 0,
      openInvoiceDues: open.map((row) => row.due),
      openingLeft: opening.remaining,
    })

    if (plan.invoiceIndex !== null) {
      allocationRows = [
        { invoiceId: open[plan.invoiceIndex].id, amount: plan.invoiceAmount },
      ]
    }

    openingApplied = plan.openingAmount
  }

  const method = await resolvePaymentMode(parsed.data.channelId)

  if (!method) {
    return {
      status: 'error',
      message: 'Choose a payment mode',
      fieldErrors: { channelId: 'Choose a payment mode' },
      values: rawValues(formData),
    }
  }

  const details = parsePaymentDetails(method.mode, formData.get('paymentDetails'), 'in')

  if (!details.ok) {
    return {
      status: 'error',
      message: details.error,
      fieldErrors: details.fieldErrors,
      values: rawValues(formData),
    }
  }

  const number = await nextPaymentNumber()

  const payment = await prisma.payment.create({
    data: {
      number,
      customerId: parsed.data.customerId,
      amount: parsed.data.amount,
      mode: method.mode,
      channelId: method.channelId,
      modeName: method.modeName,
      reference: details.reference,
      paymentDetails: detailsColumn(details.details),
      paidOn: parsed.data.paidOn,
      notes: parsed.data.notes,
      recordedById: user.id,
      openingApplied,
      allocations: { create: allocationRows },
    },
  })

  await logActivity({
    entity: 'payment',
    id: payment.id,
    action: 'created',
    summary: 'recorded the receipt',
    actor: { id: user.id, name: user.name },
  })

  revalidatePath('/payments')
  revalidatePath('/invoices')
  redirect(`/payments/${payment.id}?created=1`)
}

export async function updateAllocations(
  paymentId: string,
  requested: { invoiceId: string; amount: number }[],
  openingApplied = 0,
): Promise<SimpleResult> {
  const user = await requireCapability('payment:update')

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, number: true, customerId: true, amount: true, orderId: true },
  })

  if (!payment) {
    return { ok: false, error: 'Receipt not found' }
  }

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

  if (!checked.ok) {
    return { ok: false, error: checked.error }
  }

  const openingChecked = await validateOpening(
    payment.customerId,
    payment.amount.toNumber(),
    round2(checked.rows.reduce((sum, row) => sum + row.amount, 0)),
    openingApplied,
    paymentId,
  )

  if (!openingChecked.ok) {
    return { ok: false, error: openingChecked.error }
  }

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

  const actor = { id: user.id, name: user.name }

  await logActivity({
    entity: 'payment',
    id: paymentId,
    action: 'updated',
    summary: 'changed how the receipt is applied',
    actor,
  })

  for (const row of checked.rows) {
    await logActivity({
      entity: 'invoice',
      id: row.invoiceId,
      action: 'payment',
      summary: `applied receipt ${payment.number} (₹${new Intl.NumberFormat('en-IN').format(row.amount)})`,
      actor,
    })
  }

  revalidatePath('/payments')
  revalidatePath(`/payments/${paymentId}`)
  revalidatePath('/invoices')

  return { ok: true, message: `${payment.number} updated` }
}

export async function deleteReceipt(paymentId: string): Promise<SimpleResult> {
  await requireCapability('payment:delete')

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { number: true, orderId: true },
  })

  if (!payment) {
    return { ok: false, error: 'Receipt not found' }
  }

  if (payment.orderId) {
    return {
      ok: false,
      error: 'This is the advance on an order. Set the advance to 0 on the order to remove it.',
    }
  }

  await prisma.payment.delete({ where: { id: paymentId } })

  revalidatePath('/payments')
  revalidatePath('/invoices')

  return { ok: true, message: `${payment.number} deleted` }
}

export async function openInvoicesFor(customerId: string) {
  await requireCapability('payment:read')

  const [invoices, opening] = await Promise.all([
    openInvoiceBalances(customerId),
    openingBalanceFor(customerId),
  ])

  return { invoices, openingLeft: opening.remaining }
}
