'use server'

// Thin web adapter: permission, FormData parsing, then the service in
// src/lib/services/purchase-bills.ts, then cache refresh and redirects.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import { billInputSchema } from '@/lib/validation/purchases'
import { requireCompanyId } from '@/lib/active-company'
import { suggestInterState } from '@/lib/purchase-rules'
import * as bills from '@/lib/services/purchase-bills'
import type { PurchaseBillStatus } from '@/generated/prisma/enums'

export type { FormState, SimpleResult }

const actorOf = (user: { id: string; name: string }) => ({
  id: user.id,
  name: user.name,
})

function parse(formData: FormData) {
  let lines: unknown = []

  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    lines = []
  }

  return billInputSchema.safeParse({
    vendorId: formData.get('vendorId'),
    poId: formData.get('poId'),
    vendorBillNumber: formData.get('vendorBillNumber'),
    billDate: formData.get('billDate'),
    dueDate: formData.get('dueDate'),
    isInterState: formData.get('isInterState') === 'true',
    notes: formData.get('notes'),
    lines,
  })
}

export async function createBill(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('purchase:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await bills.createPurchaseBill(actorOf(user), parsed.data)

  if (!result.ok) return { status: 'error', message: result.error }

  revalidatePath('/purchase-bills')
  redirect(`/purchase-bills/${result.id}?created=1`)
}

export async function updateBill(
  id: string,
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

  const result = await bills.updatePurchaseBill(actorOf(user), id, parsed.data)

  if (!result.ok) return { status: 'error', message: result.error }

  revalidatePath('/purchase-bills')
  revalidatePath(`/purchase-bills/${id}`)

  return { status: 'success', message: 'Bill saved', id }
}

/**
 * Moves a bill between draft, posted and cancelled (see the service for the
 * rules). Receiving goods in the same step also needs stock rights.
 */
export async function setBillStatus(
  id: string,
  status: PurchaseBillStatus,
  options: { receiveNow?: boolean } = {},
): Promise<SimpleResult> {
  const user = await requireCapability('purchase:update')

  if (options.receiveNow && status === 'POSTED') {
    // Receiving goods is a stock job: posting alone needs only purchase rights.
    await requireCapability('stock:create')
  }

  const result = await bills.setPurchaseBillStatus(actorOf(user), id, status, options)

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/purchase-bills')
  revalidatePath(`/purchase-bills/${id}`)

  return { ok: true, message: result.message }
}

export async function duplicateBill(id: string): Promise<SimpleResult> {
  const user = await requireCapability('purchase:create')
  const result = await bills.duplicatePurchaseBill(actorOf(user), id)

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/purchase-bills')

  return { ok: true, message: result.message, id: result.id }
}

export async function deleteBill(id: string): Promise<SimpleResult> {
  await requireCapability('purchase:delete')

  const result = await bills.deletePurchaseBill(id)

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/purchase-bills')

  return { ok: true, message: result.message }
}

/** The vendor chosen (or just added) in the picker, with what the form needs. */
export async function resolveVendor(name: string) {
  await requireCapability('purchase:read')

  const vendor = await prisma.vendor.findFirst({
    where: { name: { equals: name.trim(), mode: 'insensitive' } },
    select: { id: true, name: true, gstin: true },
  })

  return vendor
}

/** Whether buying from this vendor is inter-state, from the two GSTINs. */
export async function suggestBillInterState(vendorGstin: string | null) {
  await requireCapability('purchase:read')

  const company = await prisma.companySetting.findUnique({
    where: { id: await requireCompanyId() },
    select: { gstin: true },
  })

  return suggestInterState(company?.gstin ?? null, vendorGstin)
}
