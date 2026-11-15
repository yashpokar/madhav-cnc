'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/session'
import { orderInputSchema } from '@/lib/validation/orders'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import * as orders from '@/lib/services/orders'
import type { ScheduleConflicts } from '@/lib/services/orders'
import { OrderStatus } from '@/generated/prisma/enums'

export type { FormState, SimpleResult }

// Thin adapters: permission check, FormData -> input, then the service in
// src/lib/services/orders.ts does the work; here the result becomes the
// FormState / SimpleResult the pages expect, plus revalidation and redirects.

function parse(formData: FormData) {
  let lines: unknown = []

  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    lines = []
  }

  return orderInputSchema.safeParse({
    customerId: formData.get('customerId'),
    architectId: formData.get('architectId'),
    carpenterId: formData.get('carpenterId'),
    subject: formData.get('subject'),
    customerPoNumber: formData.get('customerPoNumber'),
    orderDate: formData.get('orderDate'),
    dueDate: formData.get('dueDate'),
    startDate: formData.get('startDate'),
    startTime: formData.get('startTime'),
    endDate: formData.get('endDate'),
    endTime: formData.get('endTime'),
    venue: formData.get('venue'),
    headcount: formData.get('headcount'),
    siteAddress: formData.get('siteAddress'),
    siteCity: formData.get('siteCity'),
    sitePincode: formData.get('sitePincode'),
    status: formData.get('status') ?? undefined,
    discountType: formData.get('discountType') ?? undefined,
    discountValue: formData.get('discountValue') || 0,
    advanceAmount: formData.get('advanceAmount') || 0,
    advanceChannelId: formData.get('advanceChannelId') ?? undefined,
    advancePaymentDetails: formData.get('advancePaymentDetails') ?? undefined,
    transportCharge: formData.get('transportCharge') || 0,
    transportTaxRatePercent: formData.get('transportTaxRatePercent') || 0,
    notes: formData.get('notes'),
    terms: formData.get('terms'),
    lines,
  })
}

export async function createOrder(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('order:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await orders.createOrder({ userId: user.id, name: user.name }, parsed.data)

  if (!result.ok) {
    return { status: 'error', message: result.error }
  }

  revalidatePath('/orders')
  redirect(`/orders/${result.id}?created=1`)
}

export async function updateOrder(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('order:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await orders.updateOrder({ userId: user.id, name: user.name }, id, parsed.data)

  if (!result.ok) {
    return { status: 'error', message: result.error }
  }

  revalidatePath('/payments')
  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)

  return { status: 'success', message: result.message, id }
}

export async function setOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<SimpleResult> {
  const user = await requireCapability('order:update')
  const result = await orders.setOrderStatus({ userId: user.id, name: user.name }, id, status)

  if (!result.ok) return result

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  revalidatePath('/production')

  return { ok: true, message: result.message }
}

export async function convertQuotationToOrder(
  quotationId: string,
): Promise<SimpleResult> {
  const user = await requireCapability('order:create')
  const result = await orders.convertQuotationToOrder({ userId: user.id, name: user.name }, quotationId)

  if (!result.ok) return result

  revalidatePath('/orders')
  revalidatePath('/quotations')
  revalidatePath(`/quotations/${quotationId}`)

  return { ok: true, message: result.message, id: result.id }
}

export async function deleteOrder(id: string): Promise<SimpleResult> {
  const user = await requireCapability('order:delete')
  const result = await orders.deleteOrder({ userId: user.id, name: user.name }, id)

  if (!result.ok) return result

  revalidatePath('/orders')
  revalidatePath('/production')
  revalidatePath('/quotations')
  revalidatePath('/payments')

  return { ok: true, message: result.message }
}

export type ConflictResult = ScheduleConflicts

/**
 * A heads-up, never a block: other live orders overlapping the chosen time.
 * Called from the order form as the dates change.
 */
export async function checkScheduleConflicts(input: {
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  excludeId?: string | null
}): Promise<ConflictResult> {
  await requireCapability('order:read')

  return orders.findOrderScheduleConflicts(input)
}
