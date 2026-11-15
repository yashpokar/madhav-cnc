import type { Metadata } from 'next'
import { BillingBanner } from '@/components/billing-banner'
import { Badge } from '@/components/catalyst/badge'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/catalyst/table'
import { requireCompanyId } from '@/lib/active-company'
import { formatBillingDate } from '@/lib/billing/format'
import { PLANS, discountPercent, formatRupees, type PaidPlan } from '@/lib/billing/plans'
import type { BillingState } from '@/lib/billing/entitlements'
import { getProvider } from '@/lib/billing/provider'
import { getBillingSnapshot, listBillingPayments } from '@/lib/services/billing'
import { requireCapability } from '@/lib/session'
import { CheckoutButton } from './checkout-button'

export const metadata: Metadata = {
  title: 'Plan & billing',
}

const STATE_BADGE: Record<BillingState, { label: string; color: 'zinc' | 'lime' | 'amber' | 'red' }> = {
  FREE: { label: 'Free plan', color: 'zinc' },
  ACTIVE: { label: 'Active', color: 'lime' },
  EXPIRING: { label: 'Ends soon', color: 'amber' },
  GRACE: { label: 'Renew now', color: 'amber' },
  EXPIRED: { label: 'Ended', color: 'red' },
}

const PAYMENT_BADGE = {
  PAID: { label: 'Paid', color: 'lime' },
  CREATED: { label: 'Not completed', color: 'zinc' },
  FAILED: { label: 'Failed', color: 'red' },
  REFUNDED: { label: 'Refunded', color: 'amber' },
} as const

function UsageMeter({ used, quota }: { used: number; quota: number | null }) {
  if (quota === null) {
    return (
      <p className="text-sm/6 text-zinc-600 dark:text-zinc-300">
        Unlimited invoices. <span className="tabular-nums">{used}</span> issued so far.
      </p>
    )
  }

  const pct = Math.min(100, Math.round((used / quota) * 100))
  const tone = used >= quota ? 'bg-red-500' : used >= quota - 2 ? 'bg-amber-500' : 'bg-zinc-900 dark:bg-white'

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm/6 font-medium text-zinc-950 dark:text-white">
          <span className="tabular-nums">{Math.min(used, quota)}</span> of {quota} free invoices used
        </p>
        <p className="text-xs/5 text-zinc-500 dark:text-zinc-400">
          {used >= quota ? 'No free invoices left' : `${quota - used} left`}
        </p>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={quota}
        aria-valuenow={Math.min(used, quota)}
        aria-label="Free invoices used"
        className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10"
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs/5 text-zinc-500 dark:text-zinc-400">
        Drafts are unlimited. An invoice counts once, when it is issued; cancelling it does not give the slot back.
      </p>
    </div>
  )
}

export default async function BillingPage() {
  await requireCapability('settings:update')

  const companyId = await requireCompanyId()
  const [{ entitlements: e, decision, enforced }, payments] = await Promise.all([
    getBillingSnapshot(companyId),
    listBillingPayments(companyId),
  ])
  const open = getProvider() !== null
  const current = PLANS[e.plan]
  const badge = STATE_BADGE[e.state]
  const upgrades = (['BUSINESS', 'BUSINESS_PRO'] as const satisfies readonly PaidPlan[]).filter(
    (plan) => PLANS[plan].rank > current.rank || (plan === e.plan && e.renewsOn !== null),
  )

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-6">
      <div className="grid gap-2">
        <Heading>Plan & billing</Heading>
        <Text className="max-w-2xl">
          Your plan covers the whole company. Reading, editing, printing, sharing, payments and receipts always keep
          working; only issuing new invoices depends on the plan.
        </Text>
      </div>

      <BillingBanner manage={false} />

      <section className="surface-card grid gap-5 p-5" aria-labelledby="current-plan">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="grid gap-1">
            <p id="current-plan" className="text-sm/6 text-zinc-500 dark:text-zinc-400">
              Current plan
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl/8 font-semibold text-zinc-950 dark:text-white">{current.name}</h2>
              <Badge color={badge.color} dot>
                {badge.label}
              </Badge>
              {e.aiPreview ? <Badge color="indigo">AI enablement preview</Badge> : null}
            </div>
          </div>
          <p className="text-sm/6 text-zinc-600 dark:text-zinc-300">
            {e.state === 'GRACE' && e.graceEndsOn
              ? `Ended ${formatBillingDate(e.renewsOn!)}. Renew by ${formatBillingDate(e.graceEndsOn)}.`
              : e.state === 'EXPIRED' && e.renewsOn
                ? `${PLANS[e.subscribedPlan].name} ended ${formatBillingDate(e.renewsOn)}.`
                : e.renewsOn
                  ? `Ends on ${formatBillingDate(e.renewsOn)}`
                  : e.plan === 'FREE'
                    ? 'No charge'
                    : 'No end date'}
          </p>
        </div>
        <UsageMeter used={decision.used} quota={e.invoiceQuota} />
        {!enforced && e.invoiceQuota !== null ? (
          <p className="surface-inset rounded-lg px-3 py-2 text-xs/5 text-zinc-600 dark:text-zinc-300">
            Plans are not enforced yet: you can keep issuing invoices past the free ones for now.
          </p>
        ) : null}
      </section>

      {upgrades.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="plans">
          <Subheading id="plans">{e.plan === 'FREE' ? 'Choose a plan' : 'Renew or upgrade'}</Subheading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {upgrades.map((id) => {
              const plan = PLANS[id]
              const renewing = id === e.plan

              return (
                <div
                  key={id}
                  className={`surface-card flex flex-col gap-4 p-5 ${id === 'BUSINESS_PRO' ? 'ring-1 ring-indigo-500/30' : ''}`}
                >
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base/7 font-semibold text-zinc-950 dark:text-white">{plan.name}</h3>
                      {plan.aiPreview ? <Badge color="indigo">AI enablement preview</Badge> : null}
                    </div>
                    <p className="text-sm/6 text-zinc-500 dark:text-zinc-400">{plan.summary}</p>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-3xl/9 font-semibold tabular-nums text-zinc-950 dark:text-white">
                      {formatRupees(plan.pricePaise)}
                    </span>
                    <span className="text-sm/6 text-zinc-500 dark:text-zinc-400">per year</span>
                    {plan.listPricePaise ? (
                      <span className="text-sm/6 text-zinc-400 line-through tabular-nums dark:text-zinc-500">
                        {formatRupees(plan.listPricePaise)}
                      </span>
                    ) : null}
                    {plan.listPricePaise ? (
                      <Badge color="lime">Launch price, {discountPercent(plan)}% off</Badge>
                    ) : null}
                  </div>
                  <ul className="grid gap-1.5 text-sm/6 text-zinc-700 dark:text-zinc-300">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <span aria-hidden="true" className="mt-2.5 size-1 shrink-0 rounded-full bg-zinc-400" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto">
                    <CheckoutButton
                      plan={id}
                      open={open}
                      outline={id !== 'BUSINESS_PRO'}
                      label={renewing ? `Renew ${plan.name}` : `Upgrade to ${plan.name}`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs/5 text-zinc-500 dark:text-zinc-400">
            One payment covers one year. It does not renew by itself: we remind you 30 days before it ends. Prices in
            Indian rupees.
          </p>
        </section>
      ) : null}

      <section className="grid gap-3" aria-labelledby="history">
        <Subheading id="history">Billing history</Subheading>
        {payments.length === 0 ? (
          <p className="surface-card p-5 text-sm/6 text-zinc-500 dark:text-zinc-400">
            No payments yet. When you buy a plan it shows up here.
          </p>
        ) : (
          <div className="surface-card overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Plan</TableHeader>
                  <TableHeader className="text-right">Amount</TableHeader>
                  <TableHeader>Method</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Receipt</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((payment) => {
                  const status = PAYMENT_BADGE[payment.status]

                  return (
                    <TableRow key={payment.id}>
                      <TableCell>{formatBillingDate(payment.paidAt ?? payment.createdAt)}</TableCell>
                      <TableCell>{PLANS[payment.plan].name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatRupees(payment.amountPaise)}</TableCell>
                      {/* The payment method is not stored, so only "Online" is known. */}
                      <TableCell>Online</TableCell>
                      <TableCell>
                        <Badge color={status.color}>{status.label}</Badge>
                      </TableCell>
                      {/* Placeholder until a GST tax invoice is generated (see docs/billing.md). */}
                      <TableCell className="font-mono text-xs/5 text-zinc-500">
                        {payment.providerPaymentId ?? '-'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
