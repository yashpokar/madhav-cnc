import { apiRoute, reply } from '@/lib/api/handler'
import { dayOrNull } from '@/lib/api/reads/format'
import { listDispatchableOrders } from '@/lib/queries/dispatches'

/** Orders a challan can be made for (ready, in production or partly dispatched), newest first. */
export const GET = apiRoute({ auth: 'company', capability: 'dispatch:read' }, async () => {
  const rows = await listDispatchableOrders()

  return reply(
    rows.map((row) => ({
      id: row.id,
      number: row.number,
      subject: row.subject,
      status: row.status,
      dueDate: dayOrNull(row.dueDate),
      customerName: row.customer.name,
    })),
  )
})
