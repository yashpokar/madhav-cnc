'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/session'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import { vendorPaymentInputSchema } from '@/lib/validation/vendor-payments'
import {
  createVendorPayment as createPayment,
  deleteVendorPayment as removePayment,
  updateVendorAllocations as updateAllocations,
} from '@/lib/services/vendor-payments'
import { openBillBalances, openingPayableFor } from '@/lib/queries/vendor-payments'

export type { FormState, SimpleResult }

function parse(formData: FormData) {
  let allocations: unknown = []

  try {
    allocations = JSON.parse(String(formData.get('allocations') ?? '[]'))
  } catch {
    allocations = []
  }

  return vendorPaymentInputSchema.safeParse({
    vendorId: formData.get('vendorId'),
    amount: formData.get('amount') || 0,
    channelId: formData.get('channelId'),
    reference: formData.get('reference'),
    paidOn: formData.get('paidOn'),
    notes: formData.get('notes'),
    allocations,
    openingApplied: formData.get('openingApplied') || 0,
  })
}

function refresh(vendorId: string, billIds: string[] = []) {
  revalidatePath('/vendor-payments')
  revalidatePath('/purchase-bills')
  revalidatePath('/payables')
  revalidatePath(`/vendors/${vendorId}`)
  revalidatePath(`/vendors/${vendorId}/statement`)

  for (const id of billIds) revalidatePath(`/purchase-bills/${id}`)
}

export async function createVendorPayment(
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

  const result = await createPayment(user.id, parsed.data)

  if (!result.ok) {
    return { status: 'error', message: result.error, values: rawValues(formData) }
  }

  refresh(parsed.data.vendorId, parsed.data.allocations.map((row) => row.billId))
  redirect(`/vendor-payments/${result.id}?created=1`)
}

export async function updateVendorAllocations(
  paymentId: string,
  requested: { billId: string; amount: number }[],
  openingApplied = 0,
): Promise<SimpleResult> {
  const user = await requireCapability('purchase:update')
  const result = await updateAllocations(user.id, paymentId, requested, openingApplied)

  if (!result.ok) return result

  refresh(result.vendorId, result.billIds)
  revalidatePath(`/vendor-payments/${paymentId}`)

  return { ok: true, message: result.message }
}

export async function deleteVendorPayment(paymentId: string): Promise<SimpleResult> {
  const user = await requireCapability('purchase:delete')
  const result = await removePayment(user.id, paymentId)

  if (!result.ok) return result

  refresh(result.vendorId)

  return { ok: true, message: result.message }
}

/** What the new-payment form needs when a vendor is picked. */
export async function openBillsFor(vendorId: string) {
  await requireCapability('purchase:read')

  const [bills, opening] = await Promise.all([
    openBillBalances(vendorId),
    openingPayableFor(vendorId),
  ])

  return { bills, openingLeft: opening.remaining, openingAsOf: opening.asOf }
}
