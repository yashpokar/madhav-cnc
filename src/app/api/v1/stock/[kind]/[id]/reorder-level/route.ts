import { ApiError } from '@/lib/api/errors'
import { apiRoute } from '@/lib/api/handler'
import { decimalOrNull } from '@/lib/api/reads/format'
import { reorderLevelBody } from '@/lib/api/schemas/purchasing'
import { must, saved } from '@/lib/api/writes'
import { setReorderLevel, type StockKind } from '@/lib/services/stock'

/** Sets (or, with null, clears) the level at which a tracked item or material counts as low. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'item:update', body: reorderLevelBody },
  async ({ params, body }) => {
    const kind = params.kind as StockKind

    if (kind !== 'item' && kind !== 'material') throw new ApiError('NOT_FOUND', 'Stock record not found.')

    const result = must(await setReorderLevel({ kind, id: params.id }, body.reorderLevel))

    return saved({ kind, id: params.id, reorderLevel: decimalOrNull(result.reorderLevel) })
  },
)
