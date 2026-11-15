// The plan catalogue: the single source of truth for prices, quota and
// features. The pricing UI, the checkout and the entitlement rules all read it.
// Amounts are in paise (INR), billed once a year.

import type { BillingPlan } from '@/generated/prisma/enums'

export type { BillingPlan }

/** Invoices a company may issue for free, over its lifetime. */
export const FREE_INVOICE_QUOTA = 10

export type PlanInfo = {
  id: BillingPlan
  name: string
  summary: string
  /** What a year costs, in paise. 0 for the free plan. */
  pricePaise: number
  /** The "was" price shown struck through, in paise. Null when there is none. */
  listPricePaise: number | null
  /** Issued invoices allowed over the company's lifetime. Null means unlimited. */
  invoiceQuota: number | null
  /** The AI enablement preview flag (an entitlement only; no AI feature exists yet). */
  aiPreview: boolean
  /** Bullet points for the pricing cards. */
  features: readonly string[]
  /** Higher beats lower when two plans are compared. */
  rank: number
}

export const PLANS: Record<BillingPlan, PlanInfo> = {
  FREE: {
    id: 'FREE',
    name: 'Free',
    summary: 'Try Prodlys with your first invoices.',
    pricePaise: 0,
    listPricePaise: null,
    invoiceQuota: FREE_INVOICE_QUOTA,
    aiPreview: false,
    features: [
      `${FREE_INVOICE_QUOTA} issued invoices, for the life of the company`,
      'Unlimited drafts, customers, quotations and orders',
      'Payments, receipts and shared links keep working',
    ],
    rank: 0,
  },
  BUSINESS: {
    id: 'BUSINESS',
    name: 'Business',
    summary: 'Everything you need to run the business.',
    pricePaise: 399_00,
    listPricePaise: 799_00,
    invoiceQuota: null,
    aiPreview: false,
    features: [
      'Unlimited invoices',
      'Quotations, orders, purchases, stock and reports',
      'Team members with roles',
    ],
    rank: 1,
  },
  BUSINESS_PRO: {
    id: 'BUSINESS_PRO',
    name: 'Business Pro',
    summary: 'Business, plus early access to what is coming next.',
    pricePaise: 999_00,
    listPricePaise: 3999_00,
    invoiceQuota: null,
    aiPreview: true,
    features: [
      'Everything in Business',
      'AI enablement preview for your customers',
      'Early access to new features',
    ],
    rank: 2,
  },
}

export const PAID_PLANS = ['BUSINESS', 'BUSINESS_PRO'] as const satisfies readonly BillingPlan[]

export type PaidPlan = (typeof PAID_PLANS)[number]

export function isPaidPlan(plan: string): plan is PaidPlan {
  return (PAID_PLANS as readonly string[]).includes(plan)
}

/** "Rs 399" style amount from paise, with the rupee sign. */
export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

/** Percent off the list price, rounded down; 0 when there is no list price. */
export function discountPercent(plan: PlanInfo): number {
  if (!plan.listPricePaise) return 0

  return Math.floor((1 - plan.pricePaise / plan.listPricePaise) * 100)
}
