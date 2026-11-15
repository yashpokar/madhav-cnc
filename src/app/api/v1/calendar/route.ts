import { apiRoute } from '@/lib/api/handler'
import { assertRange, calendarItemOut, resolveLayers } from '@/lib/api/reads/calendar'
import { calendarQuery } from '@/lib/api/schemas/reads'
import { listCalendarItems } from '@/lib/queries/calendar'

/**
 * The booking calendar for [from, to) India days. There is no page: the range is
 * the page (at most 62 days, each layer capped at 1000 rows by the query). Each
 * layer needs its own capability: orders order:read, deliveries dispatch:read,
 * invoices invoice:read, payments payment:read. Any role that can read none of
 * them is refused; asking for one the role lacks is a 403.
 */
export const GET = apiRoute({ auth: 'company', query: calendarQuery }, async ({ user, query }) => {
  assertRange(query.from, query.to)

  const layers = resolveLayers(user.role, query.layers)

  const items = await listCalendarItems({
    fromKey: query.from,
    toKey: query.to,
    includeCancelled: query.includeCancelled === 'true',
    layers,
  })

  return { from: query.from, to: query.to, layers, items: items.map(calendarItemOut) }
})
