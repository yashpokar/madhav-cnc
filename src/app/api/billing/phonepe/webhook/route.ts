import { handleWebhook } from '@/lib/services/billing'

// PhonePe calls this when an order completes or fails. The raw body is read as
// text, the credentials are checked, and the order is re-verified with PhonePe's
// status API before anything changes. Answers fast and says nothing about why.
export async function POST(request: Request) {
  const rawBody = await request.text()

  const { status } = await handleWebhook({
    rawBody,
    authorization: request.headers.get('authorization'),
  })

  return new Response(null, { status })
}
