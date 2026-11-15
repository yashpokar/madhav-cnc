import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { statesOut } from '@/lib/api/reads/reference'

// Reference data that only changes with a deploy: computed once, cached for a day
// by the app and any shared cache, revalidated with the ETag.
const STATES = statesOut()

export const GET = apiRoute({ auth: 'none' }, async ({ request }) =>
  replyWithEtag(request, STATES, {
    headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
  }),
)
