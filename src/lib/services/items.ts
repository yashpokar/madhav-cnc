// Item (catalogue) writes as plain functions. Runs inside a company scope: the
// web session's active-company cookie or the API's X-Company-Id header. The
// scope layer filters every query by that company and stamps new rows, so
// nothing here takes a companyId from a caller.
//
// Permission checks stay with the caller. Full writes take data already
// validated with itemInputSchema (src/lib/validation/items.ts), which accepts
// FormData strings and JSON values alike.

import { prisma } from '@/lib/prisma'
import { nextItemCode } from '@/lib/codes'
import { itemInputSchema, type ItemData } from '@/lib/validation/items'
import { fail, type Actor, type Failure } from '@/lib/services/people-shared'
import type { SupplyType, UnitOfMeasure } from '@/generated/prisma/enums'

export type { ItemData }

export type QuickItemInput = {
  name: string
  unit: UnitOfMeasure
  rate: string | number
  taxRatePercent: string | number
  materialId?: string | null
}

export type QuickItem = {
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

/** Services are not stocked, whatever the form sent. */
export function stockFields<
  T extends { supplyType: string; stockTracked: boolean; reorderLevel: number | null },
>(data: T): T {
  return data.supplyType === 'SERVICE'
    ? { ...data, stockTracked: false, reorderLevel: null }
    : data
}

/** Pure: total document lines an item is used on. */
export function itemUsageError(name: string, lines: number): string | null {
  return lines > 0
    ? `${name} is used on ${lines} document line(s). Mark it inactive instead so it stops appearing in new documents.`
    : null
}

export async function createItem(
  actor: Actor,
  data: ItemData,
): Promise<{ ok: true; id: string; code: string; name: string } | Failure> {
  const code = await nextItemCode()

  const item = await prisma.item.create({
    data: { ...stockFields(data), code, createdById: actor.id, updatedById: actor.id },
  })

  return { ok: true, id: item.id, code: item.code, name: item.name }
}

export async function updateItem(
  actor: Actor,
  id: string,
  data: ItemData,
): Promise<{ ok: true; id: string; name: string } | Failure> {
  const existing = await prisma.item.findUnique({ where: { id } })

  if (!existing) {
    return fail('Item not found', 'NOT_FOUND')
  }

  const item = await prisma.item.update({
    where: { id },
    data: { ...stockFields(data), updatedById: actor.id },
  })

  return { ok: true, id: item.id, name: item.name }
}

/** Refuses while the item is on any quotation, order or invoice line. */
export async function deleteItem(
  id: string,
): Promise<{ ok: true; message: string } | Failure> {
  const item = await prisma.item.findUnique({
    where: { id },
    select: { name: true },
  })

  if (!item) {
    return fail('Item not found', 'NOT_FOUND')
  }

  const [quotationLines, orderLines, invoiceLines] = await Promise.all([
    prisma.quotationLine.count({ where: { itemId: id } }),
    prisma.orderLine.count({ where: { itemId: id } }),
    prisma.invoiceLine.count({ where: { itemId: id } }),
  ])

  const usage = itemUsageError(item.name, quotationLines + orderLines + invoiceLines)

  if (usage) {
    return fail(usage)
  }

  await prisma.item.delete({ where: { id } })

  return { ok: true, message: `${item.name} deleted` }
}

/** Creates an item from the essentials, from inside a quotation or order. */
export async function quickCreateItem(
  actor: Actor,
  input: QuickItemInput,
): Promise<{ ok: true; item: QuickItem } | Failure> {
  const parsed = itemInputSchema.safeParse({
    name: input.name,
    unit: input.unit,
    rate: input.rate || 0,
    taxRatePercent: input.taxRatePercent || 0,
    materialId: input.materialId ?? '',
    isActive: true,
  })

  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, 'VALIDATION_FAILED')
  }

  const code = await nextItemCode()

  const item = await prisma.item.create({
    data: { ...parsed.data, code, createdById: actor.id, updatedById: actor.id },
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

  return {
    ok: true,
    item: {
      ...item,
      rate: item.rate.toNumber(),
      taxRatePercent: item.taxRatePercent.toNumber(),
    },
  }
}
