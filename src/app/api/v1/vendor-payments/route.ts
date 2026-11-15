import { apiRoute, reply } from '@/lib/api/handler'
import { day } from '@/lib/api/reads/format'
import { pageInMemory, sortedBy, vendorPaymentDetailFor, vendorPaymentListOut } from '@/lib/api/reads/purchasing'
import { vendorPaymentCreateBody, vendorPaymentsQuery } from '@/lib/api/schemas/purchasing'
import { must, saved } from '@/lib/api/writes'
import { listVendorPayments } from '@/lib/queries/vendor-payments'
import { createVendorPayment } from '@/lib/services/vendor-payments'

/** Newest payment date first. */
export const GET = apiRoute(
  { auth: 'company', capability: 'purchase:read', query: vendorPaymentsQuery },
  async ({ query }) => {
    const rows = await listVendorPayments({ search: query.q, mode: query.mode, from: query.from, to: query.to })
    const key = (row: (typeof rows)[number]) => day(row.paidOn)
    const { items, meta } = pageInMemory(sortedBy(rows, key, 'desc'), query, key, 'desc')

    return reply(items.map(vendorPaymentListOut), { meta })
  },
)

/**
 * Records a payment to a vendor with the web form's rules: `allocations` (and
 * `openingApplied`) say which bills it settles; with neither, the auto-apply
 * rules of the web decide. Needs `methodId` from GET /payment-methods.
 */
export const POST = apiRoute(
  { auth: 'company', capability: 'purchase:update', body: vendorPaymentCreateBody, idempotent: true },
  async ({ body, user }) => {
    const { methodId, details, ...rest } = body
    const created = must(await createVendorPayment(user.id, { ...rest, channelId: methodId, paymentDetails: details }))

    return saved(await vendorPaymentDetailFor(created.id), 201)
  },
)
