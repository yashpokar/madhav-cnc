'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { nextItemCode } from '@/lib/codes'
import { materialInputSchema, itemInputSchema } from '@/lib/validation/items'
import type { FormState } from '@/lib/actions/partners'

export type { FormState }

function fieldErrorsFrom(error: {
  issues: { path: PropertyKey[]; message: string }[]
}) {
  const fieldErrors: Record<string, string> = {}

  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '')

    if (key && !fieldErrors[key]) {
      fieldErrors[key] = issue.message
    }
  }

  return fieldErrors
}

function parse(formData: FormData) {
  return itemInputSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description'),
    type: formData.get('type') ?? undefined,
    materialId: formData.get('materialId'),
    unit: formData.get('unit') ?? undefined,
    rate: formData.get('rate') || 0,
    purchaseRate: formData.get('purchaseRate'),
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
    }
  }

  const code = await nextItemCode()

  const item = await prisma.item.create({
    data: { ...parsed.data, code, createdById: user.id, updatedById: user.id },
  })

  revalidatePath('/items')
  redirect(`/items?created=${encodeURIComponent(item.code)}`)
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
    }
  }

  const existing = await prisma.item.findUnique({ where: { id } })

  if (!existing) {
    return { status: 'error', message: 'Item not found' }
  }

  const item = await prisma.item.update({
    where: { id },
    data: { ...parsed.data, updatedById: user.id },
  })

  revalidatePath('/items')
  revalidatePath(`/items/${id}`)

  return { status: 'success', message: `${item.name} updated`, id: item.id }
}

export type QuickMaterialResult =
  | { ok: true; material: { id: string; name: string } }
  | { ok: false; error: string }

export async function quickCreateMaterial(
  name: string,
): Promise<QuickMaterialResult> {
  const user = await requireCapability('item:create')
  const parsed = materialInputSchema.safeParse({ name, sortOrder: 0 })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const existing = await prisma.material.findFirst({
    where: { name: { equals: parsed.data.name, mode: 'insensitive' } },
    select: { id: true, name: true },
  })

  if (existing) {
    return { ok: true, material: existing }
  }

  const material = await prisma.material.create({
    data: { ...parsed.data, createdById: user.id },
    select: { id: true, name: true },
  })

  revalidatePath('/items')

  return { ok: true, material }
}
