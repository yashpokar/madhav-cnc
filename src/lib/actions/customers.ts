'use server'

// Thin web adapter: permission, FormData parsing, then the service in
// src/lib/services/customers.ts, then cache refresh and redirects.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/session'
import { customerInputSchema } from '@/lib/validation/customers'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import * as customers from '@/lib/services/customers'

export type { FormState }

function parse(formData: FormData) {
  return customerInputSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type') ?? undefined,
    status: formData.get('status') ?? undefined,
    phone: formData.get('phone'),
    altPhone: formData.get('altPhone'),
    email: formData.get('email'),
    address: formData.get('address'),
    city: formData.get('city'),
    state: formData.get('state'),
    pincode: formData.get('pincode'),
    gstin: formData.get('gstin'),
    pan: formData.get('pan'),
    dateOfBirth: formData.get('dateOfBirth'),
    anniversaryDate: formData.get('anniversaryDate'),
    preferredArchitectId: formData.get('preferredArchitectId'),
    preferredCarpenterId: formData.get('preferredCarpenterId'),
    paymentTermsDays: formData.get('paymentTermsDays'),
    notes: formData.get('notes'),
    openingDue: formData.get('openingDue'),
    openingAsOf: formData.get('openingAsOf'),
  })
}

export async function createCustomer(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('customer:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await customers.createCustomer(user, parsed.data)

  if (!result.ok) {
    return { status: 'error', message: result.error }
  }

  revalidatePath('/customers')
  redirect(`/customers?created=${encodeURIComponent(result.code)}&customer=${result.id}`)
}

export async function updateCustomer(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('customer:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await customers.updateCustomer(user, id, parsed.data)

  if (!result.ok) {
    return { status: 'error', message: result.error }
  }

  revalidatePath('/customers')
  revalidatePath(`/customers/${id}`)

  return {
    status: 'success',
    message: `${result.name} updated`,
    id: result.id,
  }
}

export async function deleteCustomer(id: string) {
  await requireCapability('customer:delete')

  const result = await customers.deleteCustomer(id)

  if (!result.ok) {
    return { ok: false as const, error: result.error }
  }

  revalidatePath('/customers')

  return { ok: true as const, message: result.message }
}

export type QuickCustomerResult =
  | { ok: true; customer: customers.QuickCustomer }
  | { ok: false; error: string }

/** Creates a customer from just a name and phone, from inside another form. */
export async function quickCreateCustomer(input: {
  name: string
  phone: string
  city?: string
  email?: string
}): Promise<QuickCustomerResult> {
  const user = await requireCapability('customer:create')

  const result = await customers.quickCreateCustomer(user, input)

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  revalidatePath('/customers')

  return { ok: true, customer: result.customer }
}
