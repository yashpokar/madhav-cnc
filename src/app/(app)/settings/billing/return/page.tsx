import type { Metadata } from 'next'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { requireCompanyId } from '@/lib/active-company'
import { PLANS } from '@/lib/billing/plans'
import { confirmPayment, listBillingPayments } from '@/lib/services/billing'
import { requireCapability } from '@/lib/session'

export const metadata: Metadata = {
  title: 'Payment status',
}

// PhonePe sends the browser back here. The query string is never trusted: the
// order is looked up for THIS company and its status is asked of PhonePe.
// Opening this page twice is harmless (the upgrade happens once).
export default async function BillingReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>
}) {
  await requireCapability('settings:update')

  const { order } = await searchParams
  const companyId = await requireCompanyId()
  const result = order ? await confirmPayment({ companyId, merchantOrderId: order }) : { outcome: 'not-found' as const }
  const payment = order ? (await listBillingPayments(companyId, 50)).find((p) => p.id === order) : undefined
  const plan = payment ? PLANS[payment.plan].name : 'plan'

  const view = {
    paid: { tone: 'surface-tinted-good', title: 'Payment received', body: `Your ${plan} plan is active.` },
    'already-paid': { tone: 'surface-tinted-good', title: 'Payment received', body: `Your ${plan} plan is active.` },
    pending: {
      tone: 'surface-tinted-warn',
      title: 'Waiting for the payment to complete',
      body: 'The payment is not confirmed yet. If you paid, this can take a minute: check again shortly. You are not charged twice.',
    },
    failed: {
      tone: 'surface-tinted-bad',
      title: 'The payment did not go through',
      body: 'No plan was changed. If money left your account, it is returned by your bank; you can try again.',
    },
    'not-found': {
      tone: 'surface-tinted-bad',
      title: 'We could not find that payment',
      body: 'Open Plan & billing to see your plan and history.',
    },
  }[result.outcome]

  return (
    <div className="grid max-w-2xl grid-cols-1 gap-6">
      <Heading>Payment status</Heading>
      <div role="status" className={`${view.tone} grid gap-1 rounded-xl px-5 py-4`}>
        <h2 className="text-base/7 font-semibold">{view.title}</h2>
        <p className="text-sm/6">{view.body}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {result.outcome === 'pending' && order ? (
          <Button href={`/settings/billing/return?order=${encodeURIComponent(order)}`}>Check again</Button>
        ) : null}
        {result.outcome === 'pending' ? (
          <Button href="/settings/billing" outline>
            Back to Plan & billing
          </Button>
        ) : (
          <Button href="/settings/billing">
            {result.outcome === 'failed' ? 'Try again' : 'Back to Plan & billing'}
          </Button>
        )}
      </div>
    </div>
  )
}
