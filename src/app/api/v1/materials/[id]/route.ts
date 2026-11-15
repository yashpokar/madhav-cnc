import { ApiError } from '@/lib/api/errors'
import { apiRoute, reply } from '@/lib/api/handler'
import { materialRows } from '@/lib/api/reads/master'
import { materialPatchBody } from '@/lib/api/schemas/master'
import { must } from '@/lib/api/writes'
import {
  deleteMaterial,
  renameMaterial,
  setMaterialActive,
  setMaterialStock,
} from '@/lib/services/materials'

/**
 * Partial: send any of name, isActive, stockTracked, reorderLevel. Answers the
 * whole updated list. Turning stock tracking off clears the reorder level.
 */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'item:update', body: materialPatchBody },
  async ({ params, body }) => {
    const rows = await materialRows()
    const current = rows.find((row) => row.id === params.id)

    if (!current) throw new ApiError('NOT_FOUND', 'Material not found.')

    if (body.name !== undefined && body.name !== current.name) {
      must(await renameMaterial(params.id, body.name))
    }

    if (body.isActive !== undefined && body.isActive !== current.isActive) {
      must(await setMaterialActive(params.id, body.isActive))
    }

    if (body.stockTracked !== undefined || body.reorderLevel !== undefined) {
      const tracked = body.stockTracked ?? current.stockTracked
      const level = body.reorderLevel !== undefined ? body.reorderLevel : current.reorderLevel === null ? null : Number(current.reorderLevel)

      must(await setMaterialStock(params.id, tracked, level))
    }

    return reply(await materialRows())
  },
)

/** Refused with 409 while items use it: mark it inactive instead. */
export const DELETE = apiRoute({ auth: 'company', capability: 'item:delete' }, async ({ params }) => {
  must(await deleteMaterial(params.id))

  return reply({ id: params.id, deleted: true })
})
