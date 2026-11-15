import { apiRoute, reply } from '@/lib/api/handler'
import { pageInMemory, sortedBy, vendorDetailFor, vendorListOut } from '@/lib/api/reads/purchasing'
import { vendorsQuery, vendorWriteBody } from '@/lib/api/schemas/purchasing'
import { must, saved } from '@/lib/api/writes'
import { listVendors } from '@/lib/queries/vendors'
import { createVendor } from '@/lib/services/vendors'

/** Vendors by name. Inactive ones are left out unless `includeInactive=true`. */
export const GET = apiRoute(
  { auth: 'company', capability: 'expense:read', query: vendorsQuery },
  async ({ query }) => {
    const rows = await listVendors({ search: query.q, includeInactive: query.includeInactive === 'true' })
    const key = (row: (typeof rows)[number]) => row.name.toLowerCase()
    const { items, meta } = pageInMemory(sortedBy(rows, key, 'asc'), query, key, 'asc')

    return reply(items.map(vendorListOut), { meta })
  },
)

/** A name another vendor already has is 409 CONFLICT. */
export const POST = apiRoute(
  { auth: 'company', capability: 'expense:create', body: vendorWriteBody, idempotent: true },
  async ({ body }) => {
    const created = must(await createVendor(body))

    return saved(await vendorDetailFor(created.id), 201)
  },
)
