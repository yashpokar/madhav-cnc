import { ApiError } from '@/lib/api/errors'
import { apiRoute, reply } from '@/lib/api/handler'
import { day } from '@/lib/api/reads/format'
import { goodsReceiptDetailFor, goodsReceiptListOut, pageInMemory, sortedBy } from '@/lib/api/reads/purchasing'
import { goodsReceiptCreateBody, goodsReceiptsQuery } from '@/lib/api/schemas/purchasing'
import { actorOf, must, saved } from '@/lib/api/writes'
import { listReceipts } from '@/lib/queries/goods-receipts'
import { postReceiptLogged } from '@/lib/services/goods-receipts'

/** Newest received date first. */
export const GET = apiRoute(
  { auth: 'company', capability: 'purchase:read', query: goodsReceiptsQuery },
  async ({ query }) => {
    const rows = await listReceipts({ search: query.q, status: query.status })
    const key = (row: (typeof rows)[number]) => day(row.receivedOn)
    const { items, meta } = pageInMemory(sortedBy(rows, key, 'desc'), query, key, 'desc')

    return reply(items.map(goodsReceiptListOut), { meta })
  },
)

/**
 * Receives goods against a posted bill (`billId`) or a sent order (`poId`):
 * quantities per line of GET /goods-receipts/receivable. Adds the goods to stock.
 */
export const POST = apiRoute(
  { auth: 'company', capability: 'stock:create', body: goodsReceiptCreateBody, idempotent: true },
  async ({ body, user }) => {
    const source = body.billId
      ? ({ kind: 'bill', billId: body.billId } as const)
      : ({ kind: 'order', poId: body.poId as string } as const)

    const result = must(
      await postReceiptLogged(actorOf(user), {
        source,
        receivedOn: body.receivedOn,
        notes: body.notes,
        lines: body.lines,
      }),
    )

    if (!result.receipt) throw new ApiError('CONFLICT', 'Nothing was left to receive')

    return saved(await goodsReceiptDetailFor(result.receipt.id), 201)
  },
)
