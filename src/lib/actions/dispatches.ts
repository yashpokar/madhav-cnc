'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/session'
import type { DispatchInput } from '@/lib/validation/dispatches'
import { rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'
import { DispatchStatus } from '@/generated/prisma/enums'
import * as dispatches from '@/lib/services/dispatches'

export type { FormState, SimpleResult }

/**
 * Thin adapters over src/lib/services/dispatches.ts: capability check, FormData
 * to the service's JSON input, then the redirect / cache refresh and the
 * FormState the form shows.
 */

const actorOf = (user: { id: string; name: string }) => ({
  id: user.id,
  name: user.name,
})

function parse(formData: FormData): DispatchInput {
  let lines: unknown = []

  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    lines = []
  }

  return {
    orderId: formData.get('orderId'),
    dispatchDate: formData.get('dispatchDate'),
    status: formData.get('status') ?? undefined,
    vehicleNumber: formData.get('vehicleNumber'),
    driverName: formData.get('driverName'),
    driverPhone: formData.get('driverPhone'),
    transporterName: formData.get('transporterName'),
    lrNumber: formData.get('lrNumber'),
    deliveryAddress: formData.get('deliveryAddress'),
    deliveryCity: formData.get('deliveryCity'),
    deliveryPincode: formData.get('deliveryPincode'),
    notes: formData.get('notes'),
    lines,
  } as DispatchInput
}

function failure(
  result: Extract<dispatches.DispatchSaveResult, { ok: false }>,
  formData: FormData,
): FormState {
  if (result.fieldErrors) {
    return {
      status: 'error',
      message: result.error,
      fieldErrors: result.fieldErrors,
      values: rawValues(formData),
    }
  }

  return { status: 'error', message: result.error }
}

export async function createDispatch(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('dispatch:create')
  const result = await dispatches.createDispatch(actorOf(user), parse(formData))

  if (!result.ok) {
    return failure(result, formData)
  }

  revalidatePath('/dispatch')
  revalidatePath(`/orders/${result.orderId}`)
  redirect(`/dispatch/${result.id}?created=1`)
}

export async function updateDispatch(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('dispatch:update')
  const result = await dispatches.updateDispatch(actorOf(user), id, parse(formData))

  if (!result.ok) {
    return failure(result, formData)
  }

  revalidatePath('/dispatch')
  revalidatePath(`/dispatch/${id}`)

  return { status: 'success', message: 'Delivery challan saved', id }
}

export async function setDispatchStatus(
  id: string,
  status: DispatchStatus,
): Promise<SimpleResult> {
  const user = await requireCapability('dispatch:update')
  const result = await dispatches.setDispatchStatus(actorOf(user), id, status)

  if (!result.ok) {
    return result
  }

  revalidatePath('/dispatch')
  revalidatePath(`/dispatch/${id}`)
  revalidatePath(`/orders/${result.orderId}`)

  return { ok: true, message: result.message }
}

export async function recordReceipt(
  id: string,
  receivedByName: string,
): Promise<SimpleResult> {
  const user = await requireCapability('dispatch:update')
  const result = await dispatches.recordReceipt(actorOf(user), id, receivedByName)

  if (!result.ok) {
    return result
  }

  revalidatePath('/dispatch')
  revalidatePath(`/dispatch/${id}`)
  revalidatePath(`/orders/${result.orderId}`)

  return { ok: true, message: result.message }
}

export async function deleteDispatch(id: string): Promise<SimpleResult> {
  const user = await requireCapability('dispatch:delete')
  const result = await dispatches.deleteDispatch(actorOf(user), id)

  if (!result.ok) {
    return result
  }

  revalidatePath('/dispatch')

  return { ok: true, message: result.message }
}
