import { apiRoute } from '@/lib/api/handler'
import { vendorPaymentDetailFor } from '@/lib/api/reads/purchasing'
import { vendorAllocationsBody } from '@/lib/api/schemas/purchasing'
import { must, saved } from '@/lib/api/writes'
import { updateVendorAllocations } from '@/lib/services/vendor-payments'

/** Replaces what the payment settles (a full list: bills and the opening payable). Over-allocating is 409. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'purchase:update', body: vendorAllocationsBody },
  async ({ params, body, user }) => {
    must(await updateVendorAllocations(user.id, params.id, body.allocations, body.openingApplied))

    return saved(await vendorPaymentDetailFor(params.id))
  },
)
