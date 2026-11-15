import { describe, expect, it } from 'vitest'
import {
  GRACE_DAYS,
  addYear,
  canIssueInvoice,
  getEntitlements,
  periodStartFor,
  purchaseOutcome,
  quotaLevel,
  type SubscriptionLike,
} from '@/lib/billing/entitlements'
import { FREE_INVOICE_QUOTA, PLANS, discountPercent, formatRupees } from '@/lib/billing/plans'

const DAY = 86_400_000
const now = new Date('2026-11-15T00:00:00Z')
const inDays = (n: number) => new Date(now.getTime() + n * DAY)

const paid = (over: Partial<SubscriptionLike> = {}): SubscriptionLike => ({
  plan: 'BUSINESS',
  status: 'ACTIVE',
  currentPeriodEnd: inDays(200),
  ...over,
})

describe('free quota boundaries', () => {
  const free = getEntitlements(null, now)
  const decide = (issuedCount: number, enforced: boolean) =>
    canIssueInvoice({ entitlements: free, issuedCount, enforced })

  it('allows the 10th invoice (9 used) and tells how many are left', () => {
    expect(decide(9, true)).toMatchObject({ allowed: true, remaining: 1, reason: null })
  })

  it('blocks the 11th invoice (10 used) only when enforced', () => {
    expect(decide(10, true)).toMatchObject({ allowed: false, remaining: 0, reason: 'QUOTA_REACHED' })
    expect(decide(10, false)).toMatchObject({ allowed: true, reason: 'QUOTA_REACHED' })
  })

  it('stays blocked past the quota (11 used)', () => {
    expect(decide(11, true)).toMatchObject({ allowed: false, remaining: 0 })
  })

  it('has no limit on a paid plan', () => {
    const e = getEntitlements(paid(), now)

    expect(canIssueInvoice({ entitlements: e, issuedCount: 5000, enforced: true })).toMatchObject({
      allowed: true,
      remaining: null,
    })
  })

  it('nudges from 8 of 10 and at 10 of 10', () => {
    expect(quotaLevel(decide(7, true))).toBe('none')
    expect(quotaLevel(decide(8, true))).toBe('near')
    expect(quotaLevel(decide(10, true))).toBe('reached')
  })
})

describe('getEntitlements', () => {
  it('treats a company with no subscription as FREE', () => {
    expect(getEntitlements(null, now)).toMatchObject({ plan: 'FREE', state: 'FREE', invoiceQuota: FREE_INVOICE_QUOTA })
  })

  it('keeps a no-expiry plan (grandfathered) active forever', () => {
    const e = getEntitlements(paid({ currentPeriodEnd: null }), inDays(5000))

    expect(e).toMatchObject({ plan: 'BUSINESS', state: 'ACTIVE', invoiceQuota: null, renewsOn: null })
  })

  it('moves ACTIVE -> EXPIRING inside 30 days', () => {
    expect(getEntitlements(paid({ currentPeriodEnd: inDays(31) }), now).state).toBe('ACTIVE')
    expect(getEntitlements(paid({ currentPeriodEnd: inDays(30) }), now).state).toBe('EXPIRING')
    expect(getEntitlements(paid({ currentPeriodEnd: inDays(1) }), now).daysLeft).toBe(1)
  })

  it('keeps paid limits through the grace period, then falls back to FREE', () => {
    const sub = paid({ currentPeriodEnd: inDays(-1) })

    expect(getEntitlements(sub, now)).toMatchObject({ plan: 'BUSINESS', state: 'GRACE', invoiceQuota: null })

    const afterGrace = getEntitlements(paid({ currentPeriodEnd: inDays(-GRACE_DAYS - 1) }), now)

    expect(afterGrace).toMatchObject({
      plan: 'FREE',
      subscribedPlan: 'BUSINESS',
      state: 'EXPIRED',
      invoiceQuota: FREE_INVOICE_QUOTA,
      aiPreview: false,
    })
  })

  it('honours an explicit graceUntil', () => {
    const sub = paid({ currentPeriodEnd: inDays(-10), graceUntil: inDays(1) })

    expect(getEntitlements(sub, now).state).toBe('GRACE')
  })

  it('treats a cancelled subscription as FREE', () => {
    expect(getEntitlements(paid({ status: 'CANCELLED' }), now).plan).toBe('FREE')
  })

  it('exposes the AI preview flag on Pro only', () => {
    expect(getEntitlements(paid({ plan: 'BUSINESS_PRO' }), now).aiPreview).toBe(true)
    expect(getEntitlements(paid(), now).aiPreview).toBe(false)
  })

  it('keeps the quota in force once expired (already exceeded stays blocked)', () => {
    const e = getEntitlements(paid({ currentPeriodEnd: inDays(-30) }), now)

    expect(canIssueInvoice({ entitlements: e, issuedCount: 40, enforced: true }).allowed).toBe(false)
  })
})

describe('buying', () => {
  it('starts a first purchase now', () => {
    expect(periodStartFor(null, now)).toEqual(now)
  })

  it('extends from the current end while a paid year is running', () => {
    const end = inDays(100)

    expect(periodStartFor(paid({ currentPeriodEnd: end }), now)).toEqual(end)
  })

  it('starts from now once lapsed', () => {
    expect(periodStartFor(paid({ currentPeriodEnd: inDays(-40) }), now)).toEqual(now)
  })

  it('does not downgrade a higher active plan', () => {
    expect(purchaseOutcome(paid({ plan: 'BUSINESS_PRO' }), 'BUSINESS', now)).toBe('keep')
    expect(purchaseOutcome(paid(), 'BUSINESS_PRO', now)).toBe('apply')
    expect(purchaseOutcome(paid(), 'BUSINESS', now)).toBe('apply')
  })

  it('lets a lower plan be bought once the higher one lapsed', () => {
    expect(purchaseOutcome(paid({ plan: 'BUSINESS_PRO', currentPeriodEnd: inDays(-60) }), 'BUSINESS', now)).toBe('apply')
  })

  it('adds a calendar year, handling 29 February', () => {
    expect(addYear(new Date('2026-11-15T00:00:00Z')).toISOString()).toBe('2027-11-15T00:00:00.000Z')
    expect(addYear(new Date('2028-02-29T00:00:00Z')).toISOString()).toBe('2029-02-28T00:00:00.000Z')
  })
})

describe('plan catalogue', () => {
  it('matches the approved prices', () => {
    expect(PLANS.FREE).toMatchObject({ pricePaise: 0, invoiceQuota: 10 })
    expect(PLANS.BUSINESS).toMatchObject({ pricePaise: 39_900, listPricePaise: 79_900, invoiceQuota: null })
    expect(PLANS.BUSINESS_PRO).toMatchObject({ pricePaise: 99_900, listPricePaise: 399_900, aiPreview: true })
  })

  it('lists every price below its list price and ranks plans upward', () => {
    for (const plan of Object.values(PLANS)) {
      if (plan.listPricePaise) expect(plan.listPricePaise).toBeGreaterThan(plan.pricePaise)
    }

    expect(PLANS.FREE.rank).toBeLessThan(PLANS.BUSINESS.rank)
    expect(PLANS.BUSINESS.rank).toBeLessThan(PLANS.BUSINESS_PRO.rank)
  })

  it('formats rupees and discounts', () => {
    expect(formatRupees(39_900)).toBe('₹399')
    expect(formatRupees(399_900)).toBe('₹3,999')
    expect(discountPercent(PLANS.BUSINESS)).toBe(50)
    expect(discountPercent(PLANS.BUSINESS_PRO)).toBe(75)
  })
})
