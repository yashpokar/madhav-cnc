'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { nextPaymentNumber } from '@/lib/codes'
import { round2 } from '@/lib/pricing'
import { receiptInputSchema } from '@/lib/validation/payments'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import { openInvoiceBalances } from '@/lib/queries/payments'

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
    mode: formData.get('mode') ?? undefined,
    reference: formData.get('reference'),
    paidOn: formData.get('paidOn'),
    notes: formData.get('notes'),
    allocations,
  })
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

  const number = await nextPaymentNumber()

  const payment = await prisma.payment.create({
    data: {
      number,
      customerId: parsed.data.customerId,
      amount: parsed.data.amount,
      mode: parsed.data.mode,
      reference: parsed.data.reference,
      paidOn: parsed.data.paidOn,
      notes: parsed.data.notes,
      recordedById: user.id,
      allocations: { create: checked.rows },
    },
  })

  revalidatePath('/payments')
  revalidatePath('/invoices')
  redirect(`/payments/${payment.id}?created=1`)
}

export async function updateAllocations(
  paymentId: string,
  requested: { invoiceId: string; amount: number }[],
): Promise<SimpleResult> {
  await requireCapability('payment:update')

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, number: true, customerId: true, amount: true },
  })

  if (!payment) {
    return { ok: false, error: 'Receipt not found' }
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

  await prisma.$transaction([
    prisma.paymentAllocation.deleteMany({ where: { paymentId } }),
    ...checked.rows.map((row) =>
      prisma.paymentAllocation.create({
        data: { paymentId, invoiceId: row.invoiceId, amount: row.amount },
      }),
    ),
  ])

  revalidatePath('/payments')
  revalidatePath(`/payments/${paymentId}`)
  revalidatePath('/invoices')

  return { ok: true, message: `${payment.number} updated` }
}

export async function deleteReceipt(paymentId: string): Promise<SimpleResult> {
  await requireCapability('payment:delete')

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { number: true },
  })

  if (!payment) {
    return { ok: false, error: 'Receipt not found' }
  }

  await prisma.payment.delete({ where: { id: paymentId } })

  revalidatePath('/payments')
  revalidatePath('/invoices')

  return { ok: true, message: `${payment.number} deleted` }
}

export async function openInvoicesFor(customerId: string) {
  await requireCapability('payment:read')

  return openInvoiceBalances(customerId)
}
