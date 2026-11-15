import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { paymentListOut } from '@/lib/api/reads/mappers'
import { listPayments } from '@/lib/api/reads/payments'
import { paymentDetailFor } from '@/lib/api/reads/detail'
import { paymentsQuery } from '@/lib/api/schemas/reads'
import { paymentCreateBody } from '@/lib/api/schemas/writes'
import { must, saved, userActorOf } from '@/lib/api/writes'
import { createReceipt } from '@/lib/services/payments'

export const GET = apiRoute(
  { auth: 'company', capability: 'payment:read', query: paymentsQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listPayments({ search: query.q, mode: query.mode, from: query.from, to: query.to, page: args })
    const { items, meta } = paged(rows, limit, (row) => at(row.paidOn, row.id))

    return reply(items.map(paymentListOut), { meta })
  },
)

/**
 * Records a receipt, with the web form's rules: `allocations` (and
 * `openingApplied`) say what it settles; with neither, a customer with exactly
 * one open invoice (or only an opening balance) gets it applied there, and with
 * several open items the receipt stays unallocated until the person chooses.
 */
export const POST = apiRoute(
  { auth: 'company', capability: 'payment:create', body: paymentCreateBody, idempotent: true },
  async ({ body, user }) => {
    const { methodId, details, ...rest } = body
    const created = must(
      await createReceipt(userActorOf(user), { ...rest, channelId: methodId, paymentDetails: details }),
    )

    return saved(await paymentDetailFor(created.id), 201)
  },
)
