import { z } from 'zod'
import { ApiError } from '@/lib/api/errors'
import { apiRoute, parseWith, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { invoiceListOut } from '@/lib/api/reads/mappers'
import { invoiceDetailFor } from '@/lib/api/reads/detail'
import { invoicesQuery } from '@/lib/api/schemas/reads'
import { invoiceCreateBody, invoiceInputSchema } from '@/lib/api/schemas/writes'
import { actorOf, must, saved } from '@/lib/api/writes'
import { getCustomer } from '@/lib/queries/customers'
import { listInvoices } from '@/lib/queries/invoices'
import { createInvoice, createInvoiceFromOrder, suggestInterState } from '@/lib/services/invoices'

export const GET = apiRoute(
  { auth: 'company', capability: 'invoice:read', query: invoicesQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listInvoices({ search: query.q, status: query.status, page: args })
    const { items, meta } = paged(rows, limit, (row) => at(row.createdAt, row.id))

    return reply(items.map(invoiceListOut), { meta })
  },
)

/**
 * Creates an invoice. Send `{ orderId }` alone for a draft from a completed
 * order (its lines, discount, transport and advance), or a whole invoice.
 * A manual invoice with `status: "ISSUED"` counts against the plan's quota
 * (402 PLAN_LIMIT_REACHED); a draft never does. `isInterState` defaults to
 * what the customer's state and the company's state say.
 */
export const POST = apiRoute(
  { auth: 'company', capability: 'invoice:create', body: invoiceCreateBody, idempotent: true },
  async ({ body, user }) => {
    if (typeof body.orderId === 'string' && body.orderId && body.lines === undefined) {
      const { orderId } = parseWith(z.object({ orderId: z.string().min(1) }), body, 'request body')
      const created = must(await createInvoiceFromOrder(actorOf(user), orderId))

      return saved(await invoiceDetailFor(created.id), 201)
    }

    let doc: Record<string, unknown> = body

    if (doc.isInterState === undefined && typeof doc.customerId === 'string' && doc.customerId) {
      const customer = await getCustomer(doc.customerId)

      if (!customer) throw new ApiError('NOT_FOUND', 'Customer not found.')

      doc = { ...doc, isInterState: await suggestInterState(customer.state) }
    }

    const data = parseWith(invoiceInputSchema, doc, 'request body')
    const created = must(await createInvoice(actorOf(user), data))

    return saved(await invoiceDetailFor(created.id), 201)
  },
)
