import { apiRoute, reply } from '@/lib/api/handler'
import { day } from '@/lib/api/reads/format'
import { pageInMemory, purchaseBillDetailFor, purchaseBillListOut, sortedBy } from '@/lib/api/reads/purchasing'
import { purchaseBillsQuery, purchaseBillWriteBody } from '@/lib/api/schemas/purchasing'
import { actorOf, must, saved } from '@/lib/api/writes'
import { listBills } from '@/lib/queries/purchases'
import { createPurchaseBill } from '@/lib/services/purchase-bills'

/** Newest bill date first. */
export const GET = apiRoute(
  { auth: 'company', capability: 'purchase:read', query: purchaseBillsQuery },
  async ({ query }) => {
    const rows = await listBills({ search: query.q, status: query.status })
    const key = (row: (typeof rows)[number]) => day(row.billDate)
    const { items, meta } = pageInMemory(sortedBy(rows, key, 'desc'), query, key, 'desc')

    return reply(items.map(purchaseBillListOut), { meta })
  },
)

/** A new bill is a draft (totals and GST come back); post it with POST /purchase-bills/{id}/status. */
export const POST = apiRoute(
  { auth: 'company', capability: 'purchase:create', body: purchaseBillWriteBody, idempotent: true },
  async ({ body, user }) => {
    const created = must(await createPurchaseBill(actorOf(user), body))

    return saved(await purchaseBillDetailFor(created.id), 201)
  },
)
