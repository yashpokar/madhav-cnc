import { apiRoute, reply, replyWithEtag } from '@/lib/api/handler'
import { vendorPaymentDetailFor } from '@/lib/api/reads/purchasing'
import { must } from '@/lib/api/writes'
import { deleteVendorPayment } from '@/lib/services/vendor-payments'

export const GET = apiRoute({ auth: 'company', capability: 'purchase:read' }, async ({ request, params }) =>
  replyWithEtag(request, await vendorPaymentDetailFor(params.id)),
)

/** Deletes the payment; its allocations go with it, so the bills owe again. */
export const DELETE = apiRoute({ auth: 'company', capability: 'purchase:delete' }, async ({ params, user }) => {
  must(await deleteVendorPayment(user.id, params.id))

  return reply({ id: params.id, deleted: true })
})
