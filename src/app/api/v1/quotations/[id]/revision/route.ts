import { apiRoute } from '@/lib/api/handler'
import { quotationDetailFor } from '@/lib/api/reads/detail'
import { must, saved, userActorOf } from '@/lib/api/writes'
import { createRevision } from '@/lib/services/quotations'

/** A new draft revision copied from this quotation (201, the new quotation). */
export const POST = apiRoute(
  { auth: 'company', capability: 'quotation:create', idempotent: true },
  async ({ params, user }) => {
    const created = must(await createRevision(userActorOf(user), params.id))

    return saved(await quotationDetailFor(created.id), 201)
  },
)
