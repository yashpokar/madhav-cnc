import { apiRoute } from '@/lib/api/handler'
import { methodSchemaOut } from '@/lib/api/reads/reference'
import { listPaymentModeOptions } from '@/lib/queries/payment-modes'

/** The company's active payment methods, each with the fields to ask for (to render a form). */
export const GET = apiRoute({ auth: 'company', capability: 'payment:read' }, async () => {
  const modes = await listPaymentModeOptions()

  return modes.map(methodSchemaOut)
})
