'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/session'
import { quotationInputSchema } from '@/lib/validation/quotations'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import * as quotations from '@/lib/services/quotations'
import type { QuotationStatus } from '@/generated/prisma/enums'

export type { FormState }

// Thin adapters: permission check, FormData -> input, then the service in
// src/lib/services/quotations.ts does the work; here the result becomes the
// FormState / SimpleResult the pages expect, plus revalidation and redirects.

function parse(formData: FormData) {
  let lines: unknown = []

  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    lines = []
  }

  return quotationInputSchema.safeParse({
    customerId: formData.get('customerId'),
    architectId: formData.get('architectId'),
    carpenterId: formData.get('carpenterId'),
    subject: formData.get('subject'),
    quotationDate: formData.get('quotationDate'),
    validUntil: formData.get('validUntil'),
    siteAddress: formData.get('siteAddress'),
    siteCity: formData.get('siteCity'),
    sitePincode: formData.get('sitePincode'),
    status: formData.get('status') ?? undefined,
    discountType: formData.get('discountType') ?? undefined,
    discountValue: formData.get('discountValue') || 0,
    advancePercent: formData.get('advancePercent') || 0,
    notes: formData.get('notes'),
    terms: formData.get('terms'),
    lines,
  })
}

export async function createQuotation(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('quotation:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await quotations.createQuotation(
    { userId: user.id, name: user.name },
    parsed.data,
  )

  if (!result.ok) {
    return { status: 'error', message: result.error }
  }

  revalidatePath('/quotations')
  redirect(`/quotations/${result.id}?created=1`)
}

export async function updateQuotation(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('quotation:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await quotations.updateQuotation(
    { userId: user.id, name: user.name },
    id,
    parsed.data,
  )

  if (!result.ok) {
    return { status: 'error', message: result.error }
  }

  revalidatePath('/quotations')
  revalidatePath(`/quotations/${id}`)

  return { status: 'success', message: result.message, id }
}

export type SimpleResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string }

export async function setQuotationStatus(
  id: string,
  status: QuotationStatus,
): Promise<SimpleResult> {
  const user = await requireCapability('quotation:update')
  const result = await quotations.setQuotationStatus({ userId: user.id, name: user.name }, id, status)

  if (!result.ok) return result

  revalidatePath('/quotations')
  revalidatePath(`/quotations/${id}`)

  return { ok: true, message: result.message }
}

export async function createRevision(id: string): Promise<SimpleResult> {
  const user = await requireCapability('quotation:create')
  const result = await quotations.createRevision({ userId: user.id, name: user.name }, id)

  if (!result.ok) return result

  revalidatePath('/quotations')

  return { ok: true, message: result.message, id: result.id }
}

export async function deleteQuotation(id: string): Promise<SimpleResult> {
  const user = await requireCapability('quotation:delete')
  const result = await quotations.deleteQuotation({ userId: user.id, name: user.name }, id)

  if (!result.ok) return result

  revalidatePath('/quotations')

  return { ok: true, message: result.message }
}
