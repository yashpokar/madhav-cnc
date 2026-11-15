import { ApiError } from '@/lib/api/errors'
import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { decimal } from '@/lib/api/reads/format'
import { getOrderForDispatch } from '@/lib/queries/dispatches'

/** One order with, per line, what was ordered, already sent and still left to send (to fill in a challan). */
export const GET = apiRoute({ auth: 'company', capability: 'dispatch:read' }, async ({ request, params }) => {
  const order = await getOrderForDispatch(params.orderId)

  if (!order) throw new ApiError('NOT_FOUND', 'Order not found.')

  return replyWithEtag(request, {
    id: order.id,
    number: order.number,
    subject: order.subject,
    status: order.status,
    siteAddress: order.siteAddress,
    siteCity: order.siteCity,
    sitePincode: order.sitePincode,
    customerName: order.customer.name,
    customerPhone: order.customer.phone,
    lines: order.lines.map((line) => ({
      id: line.id,
      position: line.position,
      description: line.description,
      unit: line.unit,
      ordered: decimal(line.ordered),
      dispatched: decimal(line.dispatched),
      remaining: decimal(line.remaining),
    })),
  })
})
