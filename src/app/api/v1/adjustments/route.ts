import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { adjustmentFor, adjustmentOut } from '@/lib/api/reads/master'
import { ADJUSTMENT_RULES, mustMap } from '@/lib/api/master'
import { adjustmentsQuery, adjustmentWriteBody } from '@/lib/api/schemas/master'
import { saved, userActorOf } from '@/lib/api/writes'
import { listAdjustments } from '@/lib/queries/adjustments'
import { createAdjustment } from '@/lib/services/adjustments'

/** Balance adjustments (a payment mode's balance or what a customer owes), newest first. */
export const GET = apiRoute(
  { auth: 'company', capability: 'payment:read', query: adjustmentsQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listAdjustments({
      search: query.q,
      kind: query.kind,
      reason: query.reason,
      from: query.from,
      to: query.to,
      page: args,
    })
    const { items, meta } = paged(rows, limit, (row) => at(row.adjustedOn, row.id))

    return reply(items.map(adjustmentOut), { meta })
  },
)

/**
 * Moves a balance without a source document. `kind` CHANNEL adjusts a payment
 * mode (`targetId` is its id), CUSTOMER adjusts what a customer owes;
 * `direction` and a positive `amount` give the sign. A reason and a note are required.
 */
export const POST = apiRoute(
  { auth: 'company', capability: 'settings:update', body: adjustmentWriteBody, idempotent: true },
  async ({ body, user }) => {
    const created = mustMap(await createAdjustment(userActorOf(user), body), ADJUSTMENT_RULES)

    return saved(await adjustmentFor(created.id), 201)
  },
)
