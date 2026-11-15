'use server'

// Thin web adapter: permission, FormData parsing, then the service in
// src/lib/services/vendors.ts, then cache refresh and redirects.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/session'
import { vendorInputSchema } from '@/lib/validation/vendors'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import * as vendors from '@/lib/services/vendors'

export type { FormState }

function parse(formData: FormData) {
  return vendorInputSchema.safeParse({
    name: formData.get('name'),
    contactName: formData.get('contactName'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    gstin: formData.get('gstin'),
    address: formData.get('address'),
    city: formData.get('city'),
    description: formData.get('description'),
    isActive: formData.get('isActive') === 'true',
    openingPayable: formData.get('openingPayable'),
    openingAsOf: formData.get('openingAsOf'),
  })
}

export async function createVendor(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireCapability('expense:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await vendors.createVendor(parsed.data)

  if (!result.ok) {
    return {
      status: 'error',
      message: result.error,
      fieldErrors: result.fieldErrors,
      values: rawValues(formData),
      existingId: result.existingId,
    }
  }

  revalidatePath('/vendors')
  redirect(`/vendors/${result.id}?created=1`)
}

export async function updateVendor(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireCapability('expense:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await vendors.updateVendor(id, parsed.data)

  if (!result.ok) {
    // A duplicate name echoes the form back; "not found" has no fields to show.
    return result.existingId
      ? {
          status: 'error',
          message: result.error,
          fieldErrors: result.fieldErrors,
          values: rawValues(formData),
          existingId: result.existingId,
        }
      : { status: 'error', message: result.error }
  }

  revalidatePath('/vendors')
  revalidatePath(`/vendors/${id}`)
  revalidatePath('/expenses')

  return { status: 'success', message: 'Vendor saved', id }
}

export async function deleteVendor(id: string) {
  await requireCapability('expense:delete')

  const result = await vendors.deleteVendor(id)

  if (!result.ok) {
    return { ok: false as const, error: result.error }
  }

  revalidatePath('/vendors')

  return { ok: true as const, message: result.message }
}

/** A vendor added on the spot from a picker; returns it so it can be selected. */
export async function quickCreateVendor(input: {
  name: string
  contactName?: string
  phone?: string
  city?: string
  description?: string
  gstin?: string
}) {
  await requireCapability('expense:create')

  const result = await vendors.quickCreateVendor(input)

  if (!result.ok) {
    return { ok: false as const, error: result.error }
  }

  revalidatePath('/vendors')

  return { ok: true as const, vendor: result.vendor }
}
