'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { withAuditNote } from '@/lib/audit-trail/context'
import { requireCapability } from '@/lib/session'
import { invoiceInputSchema } from '@/lib/validation/invoices'
import type { PaymentInput, WriteOffInput } from '@/lib/validation/invoices'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import type { InvoiceStatus } from '@/generated/prisma/enums'
import * as invoices from '@/lib/services/invoices'
import { BILLING_PAGE, planLimitMessage } from '@/lib/billing/web'

export type { FormState, SimpleResult }

// Thin adapters: the capability check, FormData -> zod, the call into
// src/lib/services/invoices.ts, then the same messages, revalidation and
// redirects as before. The business rules live in the service.

const actorOf = (user: { id: string; name: string }) => ({
  id: user.id,
  name: user.name,
})

/** A service result as the { ok, message | error } shape the buttons expect. */
function simple(
  result: { ok: true; message: string } | { ok: false; error: string },
  id?: string,
): SimpleResult {
  return result.ok
    ? { ok: true, message: result.message, ...(id ? { id } : {}) }
    : { ok: false, error: result.error }
}

function parse(formData: FormData) {
  let lines: unknown = []

  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    lines = []
  }

  return invoiceInputSchema.safeParse({
    customerId: formData.get('customerId'),
    orderId: formData.get('orderId'),
    invoiceDate: formData.get('invoiceDate'),
    dueDate: formData.get('dueDate'),
    status: formData.get('status') ?? undefined,
    placeOfSupply: formData.get('placeOfSupply'),
    isInterState: formData.get('isInterState') === 'true',
    billingAddress: formData.get('billingAddress'),
    customerGstin: formData.get('customerGstin'),
    discountType: formData.get('discountType') ?? undefined,
    discountValue: formData.get('discountValue') || 0,
    transportCharge: formData.get('transportCharge') || 0,
    transportTaxRatePercent: formData.get('transportTaxRatePercent') || 0,
    advanceAdjusted: formData.get('advanceAdjusted') || 0,
    notes: formData.get('notes'),
    terms: formData.get('terms'),
    lines,
  })
}

const invalidState = (
  formData: FormData,
  error: Parameters<typeof fieldErrorsFrom>[0],
): FormState => ({
  status: 'error',
  message: 'Please correct the highlighted fields',
  fieldErrors: fieldErrorsFrom(error),
  values: rawValues(formData),
})

export async function createInvoice(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('invoice:create')
  const parsed = parse(formData)

  if (!parsed.success) return invalidState(formData, parsed.error)

  let result: Awaited<ReturnType<typeof invoices.createInvoice>>

  try {
    result = await invoices.createInvoice(actorOf(user), parsed.data)
  } catch (error) {
    const limit = planLimitMessage(error)

    if (!limit) throw error

    return { status: 'error', message: `${limit} Open Plan & billing (${BILLING_PAGE}).` }
  }

  if (!result.ok) return { status: 'error', message: result.error }

  revalidatePath('/invoices')
  redirect(`/invoices/${result.id}?created=1`)
}

export async function updateInvoice(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('invoice:update')
  const parsed = parse(formData)

  if (!parsed.success) return invalidState(formData, parsed.error)

  const result = await invoices.updateInvoice(actorOf(user), id, parsed.data)

  if (!result.ok) return { status: 'error', message: result.error }

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${id}`)

  return { status: 'success', message: 'Invoice saved', id }
}

export async function setInvoiceStatus(
  id: string,
  status: InvoiceStatus,
): Promise<SimpleResult> {
  const user = await requireCapability('invoice:update')
  let result: Awaited<ReturnType<typeof invoices.changeInvoiceStatus>>

  try {
    result = await invoices.changeInvoiceStatus(actorOf(user), id, status)
  } catch (error) {
    const limit = planLimitMessage(error)

    if (!limit) throw error

    return { ok: false, error: limit, href: BILLING_PAGE }
  }

  if (result.ok) {
    revalidatePath('/invoices')
    revalidatePath(`/invoices/${id}`)
  }

  return simple(result)
}

export async function recordPayment(
  invoiceId: string,
  input: PaymentInput,
): Promise<SimpleResult> {
  const user = await requireCapability('payment:create')
  const result = await invoices.recordInvoicePayment(actorOf(user), invoiceId, input)

  if (result.ok) {
    revalidatePath('/invoices')
    revalidatePath(`/invoices/${invoiceId}`)
  }

  return simple(result)
}

export async function removeAllocation(
  allocationId: string,
  reason?: string,
): Promise<SimpleResult> {
  const user = await requireCapability('payment:delete')
  const result = await withAuditNote({ reason }, () =>
    invoices.removePaymentAllocation(actorOf(user), allocationId),
  )

  if (result.ok) {
    revalidatePath('/invoices')
    revalidatePath('/payments')
    revalidatePath(`/invoices/${result.invoiceId}`)
  }

  return simple(result)
}

export async function writeOffInvoice(
  invoiceId: string,
  input: WriteOffInput,
): Promise<SimpleResult> {
  const user = await requireCapability('payment:update')
  const result = await invoices.writeOffInvoice(actorOf(user), invoiceId, input)

  if (result.ok) {
    revalidatePath('/invoices')
    revalidatePath(`/invoices/${invoiceId}`)
    revalidatePath('/customers')
  }

  return simple(result)
}

export async function removeWriteOff(writeOffId: string, reason?: string): Promise<SimpleResult> {
  const user = await requireCapability('payment:update')
  const result = await withAuditNote({ reason }, () => invoices.removeWriteOff(actorOf(user), writeOffId))

  if (result.ok) {
    revalidatePath('/invoices')
    revalidatePath(`/invoices/${result.invoiceId}`)
    revalidatePath('/customers')
  }

  return simple(result)
}

export async function suggestInterState(
  customerState: string | null,
): Promise<boolean> {
  return invoices.suggestInterState(customerState)
}

export async function duplicateInvoice(id: string): Promise<SimpleResult> {
  const user = await requireCapability('invoice:create')
  const result = await invoices.duplicateInvoice(actorOf(user), id)

  if (result.ok) revalidatePath('/invoices')

  return simple(result, result.ok ? result.id : undefined)
}

export async function deleteInvoice(id: string, reason?: string): Promise<SimpleResult> {
  const user = await requireCapability('invoice:delete')
  const result = await withAuditNote({ reason }, () => invoices.deleteInvoice(actorOf(user), id))

  if (result.ok) revalidatePath('/invoices')

  return simple(result)
}

/**
 * One-click draft invoice for a completed order; the draft is opened for
 * review before it is issued.
 */
export async function quickCreateInvoiceFromOrder(
  orderId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('invoice:create')
  const result = await invoices.createInvoiceFromOrder(actorOf(user), orderId)

  if (result.ok) {
    revalidatePath('/invoices')
    revalidatePath(`/orders/${result.orderId}`)
  }

  return simple(result, result.ok ? result.id : undefined)
}
