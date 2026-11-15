'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { withAuditNote } from '@/lib/audit-trail/context'
import { requireCapability } from '@/lib/session'
import { receiptInputSchema } from '@/lib/validation/payments'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import {
  createReceipt as createReceiptService,
  deleteReceipt as deleteReceiptService,
  openItemsForCustomer,
  updateReceiptAllocations,
} from '@/lib/services/payments'

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

  const result = await createReceiptService(
    { userId: user.id, name: user.name },
    { ...parsed.data, paymentDetails: formData.get('paymentDetails') },
  )

  if (!result.ok) {
    return {
      status: 'error',
      message: result.error,
      fieldErrors: result.fieldErrors,
      values: rawValues(formData),
    }
  }

  revalidatePath('/payments')
  revalidatePath('/invoices')
  redirect(`/payments/${result.id}?created=1`)
}

export async function updateAllocations(
  paymentId: string,
  requested: { invoiceId: string; amount: number }[],
  openingApplied = 0,
): Promise<SimpleResult> {
  const user = await requireCapability('payment:update')
  const result = await updateReceiptAllocations(
    { userId: user.id, name: user.name },
    paymentId,
    requested,
    openingApplied,
  )

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/payments')
  revalidatePath(`/payments/${paymentId}`)
  revalidatePath('/invoices')

  return { ok: true, message: result.message }
}

export async function deleteReceipt(paymentId: string, reason?: string): Promise<SimpleResult> {
  const user = await requireCapability('payment:delete')
  const result = await withAuditNote({ reason }, () =>
    deleteReceiptService({ userId: user.id, name: user.name }, paymentId),
  )

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/payments')
  revalidatePath('/invoices')

  return { ok: true, message: result.message }
}

export async function openInvoicesFor(customerId: string) {
  await requireCapability('payment:read')

  return openItemsForCustomer(customerId)
}
