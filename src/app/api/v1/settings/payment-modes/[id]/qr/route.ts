import { ApiError } from '@/lib/api/errors'
import { apiRoute, reply } from '@/lib/api/handler'
import { readImageUpload } from '@/lib/api/image-upload'
import { paymentModeFor } from '@/lib/api/reads/master'
import { must, saved } from '@/lib/api/writes'
import { readPaymentModeQr, removePaymentModeQr, setPaymentModeQr } from '@/lib/services/payment-mode-qr'

/** The QR code image of a payment mode (the one printed on documents), streamed with its own content type. */
export const GET = apiRoute({ auth: 'company', capability: 'payment:read' }, async ({ params }) => {
  const image = await readPaymentModeQr(params.id)

  if (!image) throw new ApiError('NOT_FOUND', 'No QR code.')

  return new Response(new Uint8Array(image.bytes), {
    headers: { 'Content-Type': image.mime, 'Cache-Control': 'private, max-age=600' },
  })
})

/** multipart/form-data with `file` (PNG, JPEG or WebP, 10 MB at most). Answers the payment mode. */
export const POST = apiRoute(
  { auth: 'company', capability: 'settings:update', upload: true },
  async ({ request, params }) => {
    const file = await readImageUpload(request, 'QR code')

    must(await setPaymentModeQr(params.id, file))

    return saved(await paymentModeFor(params.id))
  },
)

export const DELETE = apiRoute({ auth: 'company', capability: 'settings:update' }, async ({ params }) => {
  must(await removePaymentModeQr(params.id))

  return reply({ id: params.id, deleted: true })
})
