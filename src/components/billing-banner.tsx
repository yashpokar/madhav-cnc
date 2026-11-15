import { Link } from '@/components/catalyst/link'
import { quotaLevel } from '@/lib/billing/entitlements'
import { formatBillingDate } from '@/lib/billing/format'
import { PLANS } from '@/lib/billing/plans'
import { requireCompanyId } from '@/lib/active-company'
import { can } from '@/lib/permissions'
import { getBillingSnapshot } from '@/lib/services/billing'
import { requireUser } from '@/lib/session'

/**
 * A reminder about the plan, shown to the people who can change it: the free
 * invoices are nearly or fully used, the paid year ends soon, or it ended.
 * Renders nothing when there is nothing to say.
 */
export async function BillingBanner({ manage = true }: { manage?: boolean }) {
  const user = await requireUser()

  if (!can(user.role, 'settings:update')) return null

  const { entitlements: e, decision, enforced } = await getBillingSnapshot(await requireCompanyId())
  const level = quotaLevel(decision)
  const planName = PLANS[e.subscribedPlan].name

  let tone: 'warn' | 'bad' | null = null
  let text = ''

  if (e.state === 'EXPIRED' && e.renewsOn) {
    tone = 'bad'
    text = `Your ${planName} plan ended on ${formatBillingDate(e.renewsOn)}. You are back on the free limits: everything stays readable${
      level === 'reached' ? ', and new invoices need a plan' : ''
    }.`
  } else if (e.state === 'GRACE' && e.renewsOn && e.graceEndsOn) {
    tone = 'warn'
    text = `Your ${planName} plan ended on ${formatBillingDate(e.renewsOn)}. Renew by ${formatBillingDate(e.graceEndsOn)} to keep unlimited invoices.`
  } else if (e.state === 'EXPIRING' && e.renewsOn) {
    tone = 'warn'
    text = `Your ${planName} plan ends on ${formatBillingDate(e.renewsOn)} (${e.daysLeft === 1 ? '1 day' : `${e.daysLeft} days`} left). Renew to keep unlimited invoices.`
  } else if (level === 'reached') {
    tone = 'bad'
    text = enforced
      ? `You have used all ${decision.quota} free invoices. Choose a plan to issue more; everything else keeps working.`
      : `You have used all ${decision.quota} free invoices. Plans are starting soon, and nothing is blocked for now.`
  } else if (level === 'near') {
    tone = 'warn'
    text = `${decision.used} of ${decision.quota} free invoices used.`
  }

  if (!tone) return null

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl px-4 py-3 text-sm/6 print:hidden ${
        tone === 'bad' ? 'surface-tinted-bad' : 'surface-tinted-warn'
      }`}
    >
      <p className="min-w-0 flex-1">{text}</p>
      {manage ? (
        <Link href="/settings/billing" className="shrink-0 font-medium underline underline-offset-2">
          {e.state === 'FREE' ? 'See plans' : 'Renew'}
        </Link>
      ) : null}
    </div>
  )
}
