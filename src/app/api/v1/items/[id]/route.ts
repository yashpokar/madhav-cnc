import { ApiError } from '@/lib/api/errors'
import { apiRoute, parseWith, reply, replyWithEtag } from '@/lib/api/handler'
import { itemDetailOut } from '@/lib/api/reads/mappers'
import { itemDetailFor } from '@/lib/api/reads/master'
import { itemPatchBody } from '@/lib/api/schemas/master'
import { actorOf, must, saved } from '@/lib/api/writes'
import { can } from '@/lib/permissions'
import { getItem } from '@/lib/queries/items'
import { deleteItem, updateItem } from '@/lib/services/items'
import { itemInputSchema } from '@/lib/validation/items'

export const GET = apiRoute({ auth: 'company', capability: 'item:read' }, async ({ request, params, user }) => {
  const row = await getItem(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Item not found.')

  return replyWithEtag(request, itemDetailOut(row, can(user.role, 'purchase:read')))
})

/** Only the fields sent change (null clears an optional one); the merged item goes through the web's validation. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'item:update', body: itemPatchBody },
  async ({ params, body, user }) => {
    const row = await getItem(params.id)

    if (!row) throw new ApiError('NOT_FOUND', 'Item not found.')

    const current = {
      name: row.name,
      description: row.description,
      type: row.type,
      supplyType: row.supplyType,
      isFlatRate: row.isFlatRate,
      materialId: row.materialId,
      unit: row.unit,
      rate: row.rate,
      brand: row.brand,
      shade: row.shade,
      dimensionUnit: row.dimensionUnit,
      thickness: row.thickness,
      length: row.length,
      width: row.width,
      hsnCode: row.hsnCode,
      taxRatePercent: row.taxRatePercent,
      isActive: row.isActive,
      notes: row.notes,
      stockTracked: row.stockTracked,
      reorderLevel: row.reorderLevel,
    }

    const data = parseWith(itemInputSchema, { ...current, ...body }, 'item')

    must(await updateItem(actorOf(user), params.id, data))

    return saved(await itemDetailFor(user, params.id))
  },
)

/** Refused with 409 while the item is on a quotation, order or invoice line: mark it inactive instead. */
export const DELETE = apiRoute({ auth: 'company', capability: 'item:delete' }, async ({ params }) => {
  must(await deleteItem(params.id))

  return reply({ id: params.id, deleted: true })
})
