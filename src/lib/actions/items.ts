'use server'

// Thin web adapter: permission, FormData parsing, then the services in
// src/lib/services/items.ts and materials.ts, then cache refresh and redirects.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/session'
import { itemInputSchema } from '@/lib/validation/items'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import * as items from '@/lib/services/items'
import { findOrCreateMaterial } from '@/lib/services/materials'
import type { UnitOfMeasure } from '@/generated/prisma/enums'

export type { FormState }

function parse(formData: FormData) {
  return itemInputSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description'),
    type: formData.get('type') ?? undefined,
    supplyType: formData.get('supplyType') ?? undefined,
    isFlatRate: formData.get('isFlatRate') === 'true',
    materialId: formData.get('materialId'),
    unit: formData.get('unit') ?? undefined,
    rate: formData.get('rate') || 0,
    brand: formData.get('brand'),
    shade: formData.get('shade'),
    dimensionUnit: formData.get('dimensionUnit') ?? undefined,
    thickness: formData.get('thickness'),
    length: formData.get('length'),
    width: formData.get('width'),
    hsnCode: formData.get('hsnCode'),
    taxRatePercent: formData.get('taxRatePercent') || 0,
    isActive: formData.get('isActive') === 'true',
    notes: formData.get('notes'),
    stockTracked: formData.get('stockTracked') === 'true',
    reorderLevel: formData.get('reorderLevel'),
  })
}

export async function createItem(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('item:create')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await items.createItem(user, parsed.data)

  if (!result.ok) {
    return { status: 'error', message: result.error }
  }

  revalidatePath('/items')
  redirect(`/items?created=${encodeURIComponent(result.code)}`)
}

export async function updateItem(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('item:update')
  const parsed = parse(formData)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  const result = await items.updateItem(user, id, parsed.data)

  if (!result.ok) {
    return { status: 'error', message: result.error }
  }

  revalidatePath('/items')
  revalidatePath(`/items/${id}`)

  return { status: 'success', message: `${result.name} updated`, id: result.id }
}

export type QuickMaterialResult =
  | { ok: true; material: { id: string; name: string } }
  | { ok: false; error: string }

export async function quickCreateMaterial(
  name: string,
): Promise<QuickMaterialResult> {
  const user = await requireCapability('item:create')

  const result = await findOrCreateMaterial(user, name)

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  // Only a newly created material changes what the items pages show.
  if (result.created) {
    revalidatePath('/items')
  }

  return { ok: true, material: result.material }
}

export async function deleteItem(id: string) {
  await requireCapability('item:delete')

  const result = await items.deleteItem(id)

  if (!result.ok) {
    return { ok: false as const, error: result.error }
  }

  revalidatePath('/items')

  return { ok: true as const, message: result.message }
}

export type QuickItemResult =
  | { ok: true; item: items.QuickItem }
  | { ok: false; error: string }

/** Creates an item from the essentials, from inside a quotation or order. */
export async function quickCreateItem(input: {
  name: string
  unit: UnitOfMeasure
  rate: string
  taxRatePercent: string
  materialId?: string | null
}): Promise<QuickItemResult> {
  const user = await requireCapability('item:create')

  const result = await items.quickCreateItem(user, input)

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  revalidatePath('/items')

  return { ok: true, item: result.item }
}
