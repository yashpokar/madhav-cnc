import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { checked } from '@/lib/api/master'
import { dispatchDetailFor, dispatchListOut } from '@/lib/api/reads/master'
import { dispatchesQuery, dispatchWriteBody } from '@/lib/api/schemas/master'
import { actorOf, must, saved } from '@/lib/api/writes'
import { listDispatches } from '@/lib/queries/dispatches'
import { createDispatch } from '@/lib/services/dispatches'

/** Delivery challans, newest first. */
export const GET = apiRoute(
  { auth: 'company', capability: 'dispatch:read', query: dispatchesQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listDispatches({ search: query.q, status: query.status, page: args })
    const { items, meta } = paged(rows, limit, (row) => at(row.createdAt, row.id))

    return reply(items.map(dispatchListOut), { meta })
  },
)

/**
 * Makes a delivery challan for an order with the web's rules: the order must be
 * confirmed (not draft or cancelled) and no line may exceed what is left to
 * send (`GET /dispatches/dispatchable-orders/{orderId}` has the remaining quantities).
 */
export const POST = apiRoute(
  { auth: 'company', capability: 'dispatch:create', body: checked(dispatchWriteBody), idempotent: true },
  async ({ body, user }) => {
    const created = must(await createDispatch(actorOf(user), body))

    return saved(await dispatchDetailFor(created.id), 201)
  },
)
