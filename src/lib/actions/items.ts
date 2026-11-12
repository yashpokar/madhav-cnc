'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { nextItemCode } from '@/lib/codes'
import { materialInputSchema, itemInputSchema } from '@/lib/validation/items'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SupplyType, UnitOfMeasure } from '@/generated/prisma/enums'

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
      values: rawValues(formData),
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
      values: rawValues(formData),
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

export async function deleteItem(id: string) {
  await requireCapability('item:delete')

  const item = await prisma.item.findUnique({
    where: { id },
    select: { name: true },
  })

  if (!item) {
    return { ok: false as const, error: 'Item not found' }
  }

  const [quotationLines, orderLines, invoiceLines] = await Promise.all([
    prisma.quotationLine.count({ where: { itemId: id } }),
    prisma.orderLine.count({ where: { itemId: id } }),
    prisma.invoiceLine.count({ where: { itemId: id } }),
  ])

  if (quotationLines + orderLines + invoiceLines > 0) {
    return {
      ok: false as const,
      error: `${item.name} is used on ${quotationLines + orderLines + invoiceLines} document line(s). Mark it inactive instead so it stops appearing in new documents.`,
    }
  }

  await prisma.item.delete({ where: { id } })

  revalidatePath('/items')

  return { ok: true as const, message: `${item.name} deleted` }
}

export type QuickItemResult =
  | {
      ok: true
      item: {
        id: string
        code: string
        name: string
        unit: UnitOfMeasure
        rate: number
        taxRatePercent: number
        hsnCode: string | null
        brand: string | null
        supplyType: SupplyType
        isFlatRate: boolean
        material: { name: string } | null
      }
    }
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

  const parsed = itemInputSchema.safeParse({
    name: input.name,
    unit: input.unit,
    rate: input.rate || 0,
    taxRatePercent: input.taxRatePercent || 0,
    materialId: input.materialId ?? '',
    isActive: true,
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const code = await nextItemCode()

  const item = await prisma.item.create({
    data: {
      ...parsed.data,
      code,
      createdById: user.id,
      updatedById: user.id,
    },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      rate: true,
      taxRatePercent: true,
      hsnCode: true,
      brand: true,
      supplyType: true,
      isFlatRate: true,
      material: { select: { name: true } },
    },
  })

  revalidatePath('/items')

  return {
    ok: true,
    item: {
      ...item,
      rate: item.rate.toNumber(),
      taxRatePercent: item.taxRatePercent.toNumber(),
    },
  }
}
