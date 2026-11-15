import { apiRoute, reply } from '@/lib/api/handler'
import { searchQuery } from '@/lib/api/schemas/account'
import { searchFor } from '@/lib/services/search'

const TYPES = { c: 'customer', p: 'partner', m: 'item', q: 'quotation', o: 'order', i: 'invoice' } as const

/**
 * Global search (two characters at least) across customers, quotations, orders,
 * invoices, partners and items, each group only if the role may read it. At
 * most 5 hits a group. `type` and `recordId` say which GET opens a hit.
 */
export const GET = apiRoute({ auth: 'company', query: searchQuery }, async ({ query, user }) => {
  const hits = await searchFor(user.role, query.q)

  return reply(
    hits.map((hit) => ({
      id: hit.id,
      group: hit.group,
      title: hit.title,
      subtitle: hit.subtitle,
      type: TYPES[hit.id[0] as keyof typeof TYPES],
      recordId: hit.id.slice(2),
    })),
  )
})
