// Pure rules: what a company is entitled to, and whether it may issue another
// invoice. No database, no clock of its own (callers pass `now`).

import type { BillingPlan, SubscriptionStatus } from '@/generated/prisma/enums'
import { PLANS } from '@/lib/billing/plans'

/** Days after a paid year ends during which paid limits still apply. */
export const GRACE_DAYS = 7
/** Days before the end when the renewal reminder starts. */
export const RENEWAL_NOTICE_DAYS = 30

const DAY = 24 * 60 * 60 * 1000

export type SubscriptionLike = {
  plan: BillingPlan
  status: SubscriptionStatus
  currentPeriodEnd: Date | null
  graceUntil?: Date | null
}

export type BillingState =
  /** On the free plan (never paid, cancelled, or lapsed past the grace period). */
  | 'FREE'
  /** Paid and current. */
  | 'ACTIVE'
  /** Paid, ending within RENEWAL_NOTICE_DAYS. */
  | 'EXPIRING'
  /** Past the end date but inside the grace period: paid limits still apply. */
  | 'GRACE'
  /** A paid plan that lapsed: back on the free limits. */
  | 'EXPIRED'

export type Entitlements = {
  /** The plan whose limits apply right now. */
  plan: BillingPlan
  /** The plan on the subscription row (differs from `plan` once it lapsed). */
  subscribedPlan: BillingPlan
  state: BillingState
  /** Issued invoices allowed over the company's lifetime; null = unlimited. */
  invoiceQuota: number | null
  aiPreview: boolean
  /** When the current paid year ends; null for no expiry or the free plan. */
  renewsOn: Date | null
  /** Whole days until `renewsOn` (negative once past); null when there is no end. */
  daysLeft: number | null
  /** The last day of the grace period, while in it. */
  graceEndsOn: Date | null
}

export function getEntitlements(
  subscription: SubscriptionLike | null | undefined,
  now: Date,
): Entitlements {
  const free = (extra: Partial<Entitlements> = {}): Entitlements => ({
    plan: 'FREE',
    subscribedPlan: subscription?.plan ?? 'FREE',
    state: 'FREE',
    invoiceQuota: PLANS.FREE.invoiceQuota,
    aiPreview: false,
    renewsOn: null,
    daysLeft: null,
    graceEndsOn: null,
    ...extra,
  })

  if (!subscription || subscription.plan === 'FREE' || subscription.status === 'CANCELLED') {
    return free()
  }

  const info = PLANS[subscription.plan]
  const end = subscription.currentPeriodEnd

  const paid = (state: BillingState, extra: Partial<Entitlements> = {}): Entitlements => ({
    plan: subscription.plan,
    subscribedPlan: subscription.plan,
    state,
    invoiceQuota: info.invoiceQuota,
    aiPreview: info.aiPreview,
    renewsOn: end,
    daysLeft: end ? Math.ceil((end.getTime() - now.getTime()) / DAY) : null,
    graceEndsOn: null,
    ...extra,
  })

  // No expiry (grandfathered or granted by hand).
  if (!end) return paid('ACTIVE')

  if (now.getTime() <= end.getTime()) {
    const expiring = end.getTime() - now.getTime() <= RENEWAL_NOTICE_DAYS * DAY

    return paid(expiring ? 'EXPIRING' : 'ACTIVE')
  }

  const graceEnd = subscription.graceUntil ?? new Date(end.getTime() + GRACE_DAYS * DAY)

  if (now.getTime() <= graceEnd.getTime()) return paid('GRACE', { graceEndsOn: graceEnd })

  return free({
    state: 'EXPIRED',
    renewsOn: end,
    daysLeft: Math.ceil((end.getTime() - now.getTime()) / DAY),
  })
}

export type IssueDecision = {
  /** False only when the quota is used up AND enforcement is on. */
  allowed: boolean
  /** Set when the quota is used up, even while enforcement is off (so the UI can nudge). */
  reason: 'QUOTA_REACHED' | null
  /** Invoices left before the quota; null when unlimited. */
  remaining: number | null
  quota: number | null
  used: number
}

export function canIssueInvoice({
  entitlements,
  issuedCount,
  enforced,
}: {
  entitlements: Pick<Entitlements, 'invoiceQuota'>
  issuedCount: number
  enforced: boolean
}): IssueDecision {
  const quota = entitlements.invoiceQuota

  if (quota === null) {
    return { allowed: true, reason: null, remaining: null, quota, used: issuedCount }
  }

  const remaining = Math.max(0, quota - issuedCount)
  const reached = issuedCount >= quota

  return {
    allowed: !(reached && enforced),
    reason: reached ? 'QUOTA_REACHED' : null,
    remaining,
    quota,
    used: issuedCount,
  }
}

/** The free-quota nudge level, for the banner: nothing, nearly used, or used up. */
export function quotaLevel(decision: IssueDecision): 'none' | 'near' | 'reached' {
  if (decision.quota === null) return 'none'
  if (decision.used >= decision.quota) return 'reached'
  if (decision.used >= decision.quota - 2) return 'near'

  return 'none'
}

/** One year on from a date (29 Feb rolls back to 28 Feb). */
export function addYear(from: Date): Date {
  const next = new Date(from.getTime())

  next.setUTCFullYear(next.getUTCFullYear() + 1)

  if (next.getUTCMonth() !== from.getUTCMonth()) next.setUTCDate(0)

  return next
}

/**
 * Where a purchase's year starts: now, or the end of the current paid year when
 * one is still running (so buying early never wastes paid time).
 */
export function periodStartFor(subscription: SubscriptionLike | null | undefined, now: Date): Date {
  const e = getEntitlements(subscription, now)

  if (e.plan !== 'FREE' && e.renewsOn && e.renewsOn.getTime() > now.getTime()) return e.renewsOn

  return now
}

/**
 * What a completed purchase of `bought` does to a company on `current`:
 * 'apply' (new plan and period) or 'keep' (a higher plan is still running, so a
 * lower purchase must not downgrade it).
 */
export function purchaseOutcome(
  current: SubscriptionLike | null | undefined,
  bought: BillingPlan,
  now: Date,
): 'apply' | 'keep' {
  const e = getEntitlements(current, now)

  return PLANS[e.plan].rank > PLANS[bought].rank ? 'keep' : 'apply'
}
