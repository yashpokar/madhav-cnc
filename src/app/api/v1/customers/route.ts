import { createCustomerUnique } from '@/lib/services/customers'
import { customerDetailFor } from '@/lib/api/reads/detail'
import { customerInputSchema } from '@/lib/api/schemas/writes'
import { actorOf, must, saved } from '@/lib/api/writes'
import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { customerListOut } from '@/lib/api/reads/mappers'
import { customersQuery } from '@/lib/api/schemas/reads'
import { listCustomers } from '@/lib/queries/customers'

export const GET = apiRoute(
  { auth: 'company', capability: 'customer:read', query: customersQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listCustomers({ search: query.q, status: query.status, page: args })
    const { items, meta } = paged(rows, limit, (row) => at(row.createdAt, row.id))

    return reply(items.map(customerListOut), { meta })
  },
)

/** Quick create: name and phone are enough. A phone another customer uses is 409 CONFLICT. */
export const POST = apiRoute(
  { auth: 'company', capability: 'customer:create', body: customerInputSchema, idempotent: true },
  async ({ body, user }) => {
    const created = must(await createCustomerUnique(actorOf(user), body))

    return saved(await customerDetailFor(user, created.id), 201)
  },
)
