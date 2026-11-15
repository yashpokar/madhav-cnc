import { apiRoute, reply } from '@/lib/api/handler'
import { baseUrl } from '@/lib/api/public-url'
import { must, userActorOf } from '@/lib/api/writes'
import { createShareLink } from '@/lib/services/quotations'

/** The customer link: the active one, or a new one. whatsappLink opens WhatsApp with the message filled in. */
export const POST = apiRoute(
  { auth: 'company', capability: 'quotation:update', idempotent: true },
  async ({ params, user }) => {
    const { url, token, whatsappText, whatsappLink, created } = must(
      await createShareLink(userActorOf(user), params.id, baseUrl()),
    )

    return reply({ url, token, whatsappText, whatsappLink, created })
  },
)
