'use server'

// Thin web adapter: permission, FormData parsing, then the service in
// src/lib/services/purchase-orders.ts, then cache refresh and redirects.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/session'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import { orderInputSchema } from '@/lib/validation/purchases'
import * as orders from '@/lib/services/purchase-orders'
import type { PurchaseOrderStatus } from '@/generated/prisma/enums'

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

  return orderInputSchema.safeParse({
    vendorId: formData.get('vendorId'),
    orderDate: formData.get('orderDate'),
    expectedDate: formData.get('expectedDate'),
    notes: formData.get('notes'),
    lines,
  })
}

export async function createOrder(
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

  const result = await orders.createPurchaseOrder(actorOf(user), parsed.data)

  if (!result.ok) return { status: 'error', message: result.error }

  revalidatePath('/purchase-orders')
  redirect(`/purchase-orders/${result.id}?created=1`)
}

export async function updateOrder(
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

  const result = await orders.updatePurchaseOrder(actorOf(user), id, parsed.data)

  if (!result.ok) return { status: 'error', message: result.error }

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${id}`)

  return { status: 'success', message: 'Purchase order saved', id }
}

export async function setOrderStatus(
  id: string,
  status: PurchaseOrderStatus,
): Promise<SimpleResult> {
  const user = await requireCapability('purchase:update')
  const result = await orders.setPurchaseOrderStatus(actorOf(user), id, status)

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${id}`)

  return { ok: true, message: result.message }
}

export async function deleteOrder(id: string): Promise<SimpleResult> {
  await requireCapability('purchase:delete')

  const result = await orders.deletePurchaseOrder(id)

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/purchase-orders')

  return { ok: true, message: result.message }
}

/** Copies an order's lines into a new draft bill linked back to the order. */
export async function createBillFromOrder(id: string): Promise<SimpleResult> {
  const user = await requireCapability('purchase:create')
  const result = await orders.createBillFromOrder(actorOf(user), id)

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/purchase-bills')
  revalidatePath(`/purchase-orders/${result.orderId}`)

  return { ok: true, message: result.message, id: result.id }
}
