'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { nextPartnerCode } from '@/lib/codes'
import { partnerInputSchema } from '@/lib/validation/partners'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'

export type { FormState }
import type { PartnerType } from '@/generated/prisma/enums'


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

  const code = await nextPartnerCode(parsed.data.type as PartnerType)

  const partner = await prisma.partner.create({
    data: {
      ...parsed.data,
      code,
      createdById: user.id,
      updatedById: user.id,
    },
  })

  revalidatePath('/partners')
  redirect(`/partners?created=${encodeURIComponent(partner.code)}`)
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

  const existing = await prisma.partner.findUnique({ where: { id } })

  if (!existing) {
    return { status: 'error', message: 'Record not found' }
  }

  const partner = await prisma.partner.update({
    where: { id },
    data: {
      ...parsed.data,
      type: existing.type,
      updatedById: user.id,
    },
  })

  revalidatePath('/partners')
  revalidatePath(`/partners/${id}`)

  return { status: 'success', message: `${partner.name} updated`, id: partner.id }
}

export async function setPartnerActive(id: string, isActive: boolean) {
  const user = await requireCapability('partner:update')

  await prisma.partner.update({
    where: { id },
    data: { isActive, updatedById: user.id },
  })

  revalidatePath('/partners')
  revalidatePath(`/partners/${id}`)
}

export type QuickCreateResult =
  | { ok: true; partner: { id: string; code: string; name: string; firmName: string | null; city: string | null } }
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

  const parsed = partnerInputSchema.safeParse({
    type: input.type,
    name: input.name,
    phone: input.phone,
    firmName: input.firmName ?? '',
    city: input.city ?? '',
    pincode: input.pincode ?? '',
    isActive: true,
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const code = await nextPartnerCode(parsed.data.type as PartnerType)

  const partner = await prisma.partner.create({
    data: {
      ...parsed.data,
      code,
      createdById: user.id,
      updatedById: user.id,
    },
    select: { id: true, code: true, name: true, firmName: true, city: true },
  })

  revalidatePath('/partners')

  return { ok: true, partner }
}
