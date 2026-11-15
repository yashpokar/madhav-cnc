import { apiRoute, reply } from '@/lib/api/handler'
import { pageInMemory, purchaseOrderDetailFor, purchaseOrderListOut, sortedBy } from '@/lib/api/reads/purchasing'
import { purchaseOrdersQuery, purchaseOrderWriteBody } from '@/lib/api/schemas/purchasing'
import { actorOf, must, saved } from '@/lib/api/writes'
import { day } from '@/lib/api/reads/format'
import { listPurchaseOrders } from '@/lib/queries/purchases'
import { createPurchaseOrder } from '@/lib/services/purchase-orders'

/** Newest order date first. */
export const GET = apiRoute(
  { auth: 'company', capability: 'purchase:read', query: purchaseOrdersQuery },
  async ({ query }) => {
    const rows = await listPurchaseOrders({ search: query.q, status: query.status })
    const key = (row: (typeof rows)[number]) => day(row.orderDate)
    const { items, meta } = pageInMemory(sortedBy(rows, key, 'desc'), query, key, 'desc')

    return reply(items.map(purchaseOrderListOut), { meta })
  },
)

/** A new purchase order is a draft. */
export const POST = apiRoute(
  { auth: 'company', capability: 'purchase:create', body: purchaseOrderWriteBody, idempotent: true },
  async ({ body, user }) => {
    const created = must(await createPurchaseOrder(actorOf(user), body))

    return saved(await purchaseOrderDetailFor(created.id), 201)
  },
)
