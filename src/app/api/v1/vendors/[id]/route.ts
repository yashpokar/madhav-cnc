import { apiRoute, reply, replyWithEtag } from '@/lib/api/handler'
import { vendorDetailFor } from '@/lib/api/reads/purchasing'
import { vendorWriteBody } from '@/lib/api/schemas/purchasing'
import { must, saved } from '@/lib/api/writes'
import { deleteVendor, updateVendor } from '@/lib/services/vendors'

export const GET = apiRoute({ auth: 'company', capability: 'expense:read' }, async ({ request, params }) =>
  replyWithEtag(request, await vendorDetailFor(params.id)),
)

/** Replaces the vendor (send the whole record). A rename also renames the payee on its past expenses. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'expense:update', body: vendorWriteBody },
  async ({ params, body }) => {
    must(await updateVendor(params.id, body))

    return saved(await vendorDetailFor(params.id))
  },
)

/** Refused with 409 while the vendor has expenses (mark it inactive instead). */
export const DELETE = apiRoute({ auth: 'company', capability: 'expense:delete' }, async ({ params }) => {
  must(await deleteVendor(params.id))

  return reply({ id: params.id, deleted: true })
})
