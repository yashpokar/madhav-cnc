import { apiRoute } from '@/lib/api/handler'
import { decimal } from '@/lib/api/reads/format'
import { receivableQuery } from '@/lib/api/schemas/purchasing'
import { must } from '@/lib/api/writes'
import { getReceivable } from '@/lib/services/goods-receipts'

/** What can still be received against a posted bill (`billId`) or a sent order (`poId`). */
export const GET = apiRoute(
  { auth: 'company', capability: 'purchase:read', query: receivableQuery },
  async ({ query }) => {
    const source = query.billId
      ? ({ kind: 'bill', billId: query.billId } as const)
      : ({ kind: 'order', poId: query.poId as string } as const)
    const result = await getReceivable(source)

    if ('error' in result) must({ ok: false as const, error: result.error })

    const receivable = result as Exclude<typeof result, { error: string }>

    return {
      number: receivable.number,
      vendor: { id: receivable.vendorId, name: receivable.vendorName },
      billId: receivable.billId,
      poId: receivable.poId,
      lines: receivable.lines.map((line) => ({
        lineId: line.lineId,
        itemId: line.itemId,
        materialId: line.materialId,
        description: line.description,
        unit: line.unit,
        ordered: decimal(line.ordered),
        received: decimal(line.received),
        remaining: decimal(line.remaining),
        unitCost: line.unitCost.toFixed(4),
        tracked: line.tracked,
      })),
    }
  },
)
