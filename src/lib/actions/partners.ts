'use server'

// Thin web adapter: permission, FormData parsing, then the service in
// src/lib/services/partners.ts, then cache refresh and redirects.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/session'
import { partnerInputSchema } from '@/lib/validation/partners'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import * as partners from '@/lib/services/partners'
import type { PartnerType } from '@/generated/prisma/enums'

export type { FormState }

function parse(formData: FormData) {
  return partnerInputSchema.safeParse({
    type: formData.get('type'),
    name: formData.get('name'),
    firmName: formData.get('firmName'),
    phone: formData.get('phone'),
    altPhone: formData.get('altPhone'),
    email: formData.get('email'),
    address: formData.get('address'),
    city: formData.get('city'),
    state: formData.get('state'),
    pincode: formData.get('pincode'),
    isActive: formData.get('isActive') === 'true',
    notes: formData.get('notes'),
  })
}

export async function createPartner(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('partner:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await partners.createPartner(user, parsed.data)

  if (!result.ok) {
    return { status: 'error', message: result.error }
  }

  revalidatePath('/partners')
  redirect(`/partners?created=${encodeURIComponent(result.code)}`)
}

export async function updatePartner(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('partner:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await partners.updatePartner(user, id, parsed.data)

  if (!result.ok) {
    return { status: 'error', message: result.error }
  }

  revalidatePath('/partners')
  revalidatePath(`/partners/${id}`)

  return { status: 'success', message: `${result.name} updated`, id: result.id }
}

export async function setPartnerActive(id: string, isActive: boolean) {
  const user = await requireCapability('partner:update')

  const result = await partners.setPartnerActive(user, id, isActive)

  // This action returns nothing to its caller, so a missing partner surfaces
  // as an error, as it always has.
  if (!result.ok) {
    throw new Error(result.error)
  }

  revalidatePath('/partners')
  revalidatePath(`/partners/${id}`)
}

export type QuickCreateResult =
  | { ok: true; partner: partners.QuickPartner }
  | { ok: false; error: string }

export async function quickCreatePartner(input: {
  type: PartnerType
  name: string
  phone: string
  firmName?: string
  city?: string
  pincode?: string
}): Promise<QuickCreateResult> {
  const user = await requireCapability('partner:create')

  const result = await partners.quickCreatePartner(user, input)

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  revalidatePath('/partners')

  return { ok: true, partner: result.partner }
}

export async function deletePartner(id: string) {
  await requireCapability('partner:delete')

  const result = await partners.deletePartner(id)

  if (!result.ok) {
    return { ok: false as const, error: result.error }
  }

  revalidatePath('/partners')

  return { ok: true as const, message: result.message }
}
