import { apiRoute, reply } from '@/lib/api/handler'
import { money, stamp, stampOrNull } from '@/lib/api/reads/format'
import { listBillingPayments } from '@/lib/services/billing'

/** The company's plan payments, newest first (the last 20). Needs settings:update, as the web billing page does. */
export const GET = apiRoute({ auth: 'company', capability: 'settings:update' }, async ({ companyId }) => {
  const rows = await listBillingPayments(companyId)

  return reply(
    rows.map((row) => ({
      id: row.id,
      plan: row.plan,
      amount: money(row.amountPaise / 100),
      status: row.status,
      providerPaymentId: row.providerPaymentId,
      paidAt: stampOrNull(row.paidAt),
      createdAt: stamp(row.createdAt),
    })),
  )
})
