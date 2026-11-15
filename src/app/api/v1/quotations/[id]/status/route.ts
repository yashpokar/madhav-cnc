import { apiRoute } from '@/lib/api/handler'
import { quotationDetailFor } from '@/lib/api/reads/detail'
import { quotationStatusBody } from '@/lib/api/schemas/writes'
import { must, saved, userActorOf } from '@/lib/api/writes'
import { setQuotationStatus } from '@/lib/services/quotations'

/** Moves the quotation along its status table (an illegal move is 409). */
export const POST = apiRoute(
  { auth: 'company', capability: 'quotation:update', body: quotationStatusBody, idempotent: true },
  async ({ params, body, user }) => {
    must(await setQuotationStatus(userActorOf(user), params.id, body.status))

    return saved(await quotationDetailFor(params.id))
  },
)
